import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import func, select, true
from sqlalchemy.orm import Session

from app.ai import AnalyserDep
from app.db import get_session
from app.models import Application, StatusUpdate
from app.routers.profile import load_content
from app.schemas import (
    CLOSED_STATUSES,
    ApplicationCreate,
    ApplicationDetail,
    ApplicationListItem,
    ApplicationPatch,
    StatusUpdateCreate,
    StatusUpdatePatch,
)
from app.security import require_api_key

router = APIRouter(
    prefix="/applications",
    tags=["applications"],
    dependencies=[Depends(require_api_key)],
)

SessionDep = Annotated[Session, Depends(get_session)]


def _load(session: Session, application_id: uuid.UUID) -> Application:
    application = session.get(Application, application_id)
    if application is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Application not found")
    return application


def _load_update(session: Session, application_id: uuid.UUID, update_id: uuid.UUID) -> StatusUpdate:
    # Scoped by the parent, so an update can never be reached through the wrong application - and
    # an unknown application id therefore matches nothing, which is the 404 we want anyway.
    update = session.get(StatusUpdate, update_id)
    if update is None or update.application_id != application_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Status update not found")
    return update


@router.get("", response_model=list[ApplicationListItem])
def list_applications(session: SessionDep, include_closed: bool = False):
    # One lateral join, so the derived fields cost the same at 26 rows as at one.
    latest = (
        select(StatusUpdate.status, StatusUpdate.date, StatusUpdate.created_at)
        .where(StatusUpdate.application_id == Application.id)
        .order_by(StatusUpdate.date.desc(), StatusUpdate.created_at.desc())
        .limit(1)
        .lateral("latest")
    )
    query = (
        select(Application, latest.c.status, latest.c.date)
        .join(latest, true())
        .order_by(latest.c.date.desc(), latest.c.created_at.desc())
    )
    if not include_closed:
        query = query.where(latest.c.status.not_in(CLOSED_STATUSES))

    return [
        ApplicationListItem(
            id=application.id,
            title=application.title,
            company=application.company,
            sector=application.sector,
            location=application.location,
            rating=application.rating,
            match_rating=application.match_rating,
            current_status=current_status,
            last_update_date=last_update_date,
        )
        for application, current_status, last_update_date in session.execute(query)
    ]


@router.post("", response_model=ApplicationDetail, status_code=status.HTTP_201_CREATED)
def create_application(payload: ApplicationCreate, session: SessionDep):
    fields = payload.model_dump(exclude={"first_update"})
    application = Application(**fields, updates=[StatusUpdate(**payload.first_update.model_dump())])
    session.add(application)
    session.flush()
    return application


@router.get("/{application_id}", response_model=ApplicationDetail)
def get_application(application_id: uuid.UUID, session: SessionDep):
    return _load(session, application_id)


@router.patch("/{application_id}", response_model=ApplicationDetail)
def update_application(application_id: uuid.UUID, payload: ApplicationPatch, session: SessionDep):
    application = _load(session, application_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(application, field, value)
    session.flush()
    return application


@router.delete("/{application_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_application(application_id: uuid.UUID, session: SessionDep):
    session.delete(_load(session, application_id))
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{application_id}/match", response_model=ApplicationDetail)
def score_match(application_id: uuid.UUID, session: SessionDep, analyser: AnalyserDep):
    """Re-scores a stored advert against the current profile, which is the point of storing it."""
    application = _load(session, application_id)
    if not application.job_ad:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "This application has no stored job advert to score"
        )
    profile = load_content(session)
    # Scoring with no profile returns nulls, and writing those would erase a good score.
    if not profile.strip():
        raise HTTPException(status.HTTP_409_CONFLICT, "The candidate profile is empty")

    analysis = analyser(application.job_ad, profile)
    application.match_rating = analysis.match_rating
    application.match_summary = analysis.match_summary
    application.match_strengths = analysis.match_strengths
    application.match_weaknesses = analysis.match_weaknesses
    session.flush()
    return application


@router.post(
    "/{application_id}/status-updates",
    response_model=ApplicationDetail,
    status_code=status.HTTP_201_CREATED,
)
def add_status_update(application_id: uuid.UUID, payload: StatusUpdateCreate, session: SessionDep):
    application = _load(session, application_id)
    application.updates.append(StatusUpdate(**payload.model_dump()))
    session.flush()
    session.refresh(application)
    return application


@router.patch("/{application_id}/status-updates/{update_id}", response_model=ApplicationDetail)
def update_status_update(
    application_id: uuid.UUID,
    update_id: uuid.UUID,
    payload: StatusUpdatePatch,
    session: SessionDep,
):
    update = _load_update(session, application_id, update_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(update, field, value)
    session.flush()
    application = update.application
    # Both derived fields read updates[0]. The refresh re-runs the relationship's ORDER BY, so an
    # edited date reorders the timeline in the response rather than returning the loaded order.
    session.refresh(application)
    return application


@router.delete(
    "/{application_id}/status-updates/{update_id}", status_code=status.HTTP_204_NO_CONTENT
)
def delete_status_update(application_id: uuid.UUID, update_id: uuid.UUID, session: SessionDep):
    update = _load_update(session, application_id, update_id)
    remaining = session.scalar(
        select(func.count())
        .select_from(StatusUpdate)
        .where(StatusUpdate.application_id == application_id)
    )
    # The current status is derived from the updates, so an application with none has no status.
    if remaining == 1:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "An application must keep at least one status update"
        )
    session.delete(update)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
