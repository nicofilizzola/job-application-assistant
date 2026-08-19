from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.ai import EnricherDep
from app.db import get_session
from app.models import PROFILE_ID, Profile
from app.schemas import ProfileDraft, ProfileEnrich, ProfileRead, ProfileWrite
from app.security import require_api_key

router = APIRouter(prefix="/profile", tags=["profile"], dependencies=[Depends(require_api_key)])

SessionDep = Annotated[Session, Depends(get_session)]


def load_content(session: Session) -> str:
    """The profile as plain text, empty until it has been written for the first time."""
    profile = session.get(Profile, PROFILE_ID)
    return profile.content if profile else ""


@router.get("", response_model=ProfileRead)
def read_profile(session: SessionDep):
    profile = session.get(Profile, PROFILE_ID)
    # A read never writes, so an unwritten profile answers rather than creating its own row.
    return profile or ProfileRead(content="", updated_at=None)


@router.put("", response_model=ProfileRead)
def replace_profile(payload: ProfileWrite, session: SessionDep):
    profile = session.get(Profile, PROFILE_ID)
    if profile is None:
        profile = Profile(id=PROFILE_ID, content=payload.content)
        session.add(profile)
    else:
        profile.content = payload.content
    session.flush()
    return profile


@router.post("/enrich", response_model=ProfileDraft)
def enrich_profile(payload: ProfileEnrich, enricher: EnricherDep):
    """Folds an instruction into the text it was handed. Reads and writes no row: the draft is the
    caller's until the user saves it through PUT."""
    return ProfileDraft(content=enricher(payload.content, payload.instruction))
