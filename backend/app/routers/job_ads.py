from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.ai import AnalyserDep, TailorDep
from app.db import get_session
from app.routers.profile import load_content, require_profile
from app.schemas import JobAdText, JobAnalysis, ResumeDraft
from app.security import require_api_key

router = APIRouter(prefix="/job-ads", tags=["job-ads"], dependencies=[Depends(require_api_key)])

SessionDep = Annotated[Session, Depends(get_session)]


@router.post("/analyse", response_model=JobAnalysis)
def analyse_job_ad(payload: JobAdText, session: SessionDep, analyser: AnalyserDep):
    """Reads an advert. Stores nothing - the result is prefill, and the user has not agreed to it."""
    return analyser(payload.text, load_content(session))


@router.post("/resume", response_model=ResumeDraft)
def write_draft_resume(payload: JobAdText, session: SessionDep, tailor: TailorDep):
    """Writes a CV for an advert with no application yet. Stores nothing: the create form carries
    the draft in a hidden field and it is written with the application, or not at all."""
    return ResumeDraft(content=tailor(payload.text, require_profile(session)))
