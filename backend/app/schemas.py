import datetime
import uuid
from enum import StrEnum
from typing import Annotated

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, field_validator


class Status(StrEnum):
    CONTACTED = "Contacted"
    APPLIED = "Applied"
    INTERVIEW = "Interview"
    OFFER = "Offer"
    REJECTED = "Rejected"
    WITHDRAWN = "Withdrawn"


CLOSED_STATUSES = (Status.REJECTED, Status.WITHDRAWN)


def _on_a_half_step(value: float) -> float:
    if value * 2 % 1:
        raise ValueError("rating must be a whole or half point")
    return value


Rating = Annotated[float, Field(ge=1, le=5), AfterValidator(_on_a_half_step)]


class JobAdText(BaseModel):
    text: str = Field(min_length=1)


class JobAnalysis(BaseModel):
    """What one model call returns. Also the response body of POST /job-ads/analyse.

    The match fields are null when there is no profile to score against. No defaults: OpenAI's
    strict structured outputs require every property to be required, and nullability is how
    "absent" is expressed. The 210-character summary and the four-entry lists are prompt rules,
    not constraints here - a length limit in this model would turn a chatty model into a 500.
    """

    title: str
    company: str
    sector: str
    location: str
    match_rating: float | None
    match_summary: str | None
    match_strengths: list[str] | None
    match_weaknesses: list[str] | None


class ProfileWrite(BaseModel):
    content: str


class ProfileRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    content: str
    updated_at: datetime.datetime | None


class StatusUpdateCreate(BaseModel):
    date: datetime.date
    status: Status
    note: str | None = None


class StatusUpdatePatch(BaseModel):
    date: datetime.date | None = None
    status: Status | None = None
    note: str | None = None

    @field_validator("date", "status")
    @classmethod
    def reject_explicit_null(cls, value: datetime.date | Status) -> datetime.date | Status:
        """Defaults skip validation, so this only fires when the field was sent as null."""
        if value is None:
            raise ValueError("cannot be cleared")
        return value


class StatusUpdateRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    date: datetime.date
    status: Status
    note: str | None
    created_at: datetime.datetime


class ApplicationFields(BaseModel):
    title: str
    company: str
    sector: str
    location: str
    rating: Rating | None = None
    comment: str | None = None
    link: str | None = None


class ApplicationCreate(ApplicationFields):
    first_update: StatusUpdateCreate
    # Written once, by AI mode. There is no matching field on ApplicationPatch, so a later hand
    # edit cannot rewrite a score the model gave.
    job_ad: str | None = None
    match_rating: Rating | None = None
    match_summary: str | None = None
    match_strengths: list[str] | None = None
    match_weaknesses: list[str] | None = None


class ApplicationPatch(BaseModel):
    title: str | None = None
    company: str | None = None
    sector: str | None = None
    location: str | None = None
    rating: Rating | None = None
    comment: str | None = None
    link: str | None = None

    @field_validator("title", "company", "sector", "location")
    @classmethod
    def reject_explicit_null(cls, value: str) -> str:
        """Defaults skip validation, so this only fires when the field was sent as null."""
        if value is None:
            raise ValueError("cannot be cleared")
        return value


class ApplicationListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    company: str
    sector: str
    location: str
    rating: float | None
    match_rating: float | None
    current_status: Status
    last_update_date: datetime.date


class ApplicationDetail(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    company: str
    sector: str
    location: str
    rating: float | None
    comment: str | None
    link: str | None
    job_ad: str | None
    match_rating: float | None
    match_summary: str | None
    match_strengths: list[str] | None
    match_weaknesses: list[str] | None
    created_at: datetime.datetime
    updated_at: datetime.datetime
    current_status: Status
    last_update_date: datetime.date
    updates: list[StatusUpdateRead]
