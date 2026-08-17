import datetime
import uuid

from sqlalchemy import ARRAY, REAL, CheckConstraint, Date, DateTime, ForeignKey, Index, Text, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class Application(Base):
    __tablename__ = "applications"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, server_default=func.gen_random_uuid())
    title: Mapped[str] = mapped_column(Text)
    company: Mapped[str] = mapped_column(Text)
    sector: Mapped[str] = mapped_column(Text)
    location: Mapped[str] = mapped_column(Text)
    rating: Mapped[float | None] = mapped_column(REAL)
    comment: Mapped[str | None] = mapped_column(Text)
    link: Mapped[str | None] = mapped_column(Text)
    # Written by AI mode and by the re-score route, never by a hand edit: ApplicationPatch
    # deliberately has no field for any of them.
    job_ad: Mapped[str | None] = mapped_column(Text)
    match_rating: Mapped[float | None] = mapped_column(REAL)
    match_summary: Mapped[str | None] = mapped_column(Text)
    # Always assigned a whole new list, never mutated in place: SQLAlchemy does not track
    # in-place changes to an ARRAY column, so `application.match_strengths.append(...)` would
    # never reach the database.
    match_strengths: Mapped[list[str] | None] = mapped_column(ARRAY(Text))
    match_weaknesses: Mapped[list[str] | None] = mapped_column(ARRAY(Text))
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), default=func.now(), onupdate=func.now()
    )

    updates: Mapped[list["StatusUpdate"]] = relationship(
        back_populates="application",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="desc(StatusUpdate.date), desc(StatusUpdate.created_at)",
    )

    # An application always has at least one update, so updates[0] is always the current one.
    @property
    def current_status(self) -> str:
        return self.updates[0].status

    @property
    def last_update_date(self) -> datetime.date:
        return self.updates[0].date


class StatusUpdate(Base):
    __tablename__ = "status_updates"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, server_default=func.gen_random_uuid())
    application_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("applications.id", ondelete="CASCADE")
    )
    date: Mapped[datetime.date] = mapped_column(Date)
    status: Mapped[str] = mapped_column(Text)
    note: Mapped[str | None] = mapped_column(Text)
    # clock_timestamp(), not now(): now() is the transaction timestamp, so two updates written
    # together would tie here and the same-date tiebreak would have nothing to order by.
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.clock_timestamp()
    )

    application: Mapped[Application] = relationship(back_populates="updates")


PROFILE_ID = 1


class Profile(Base):
    """The candidate's own background, scored against. One user, so exactly one row."""

    __tablename__ = "profile"
    __table_args__ = (CheckConstraint(f"id = {PROFILE_ID}", name="profile_is_one_row"),)

    id: Mapped[int] = mapped_column(primary_key=True, default=PROFILE_ID)
    content: Mapped[str] = mapped_column(Text)
    updated_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), default=func.now(), onupdate=func.now()
    )


# Serves the latest-update-per-application lookup: filter by application, take the first row.
Index(
    "ix_status_updates_application_id_date_created_at",
    StatusUpdate.application_id,
    StatusUpdate.date.desc(),
    StatusUpdate.created_at.desc(),
)
