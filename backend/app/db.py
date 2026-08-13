from collections.abc import Iterator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import NullPool

from app.config import settings

# Neon hands out postgresql:// URLs, which SQLAlchemy routes to psycopg2. We use psycopg 3.
DATABASE_URL = settings.database_url.replace("postgresql://", "postgresql+psycopg://", 1)

# Serverless invocations cannot share connections, so pooling belongs to Neon, not to us.
engine = create_engine(DATABASE_URL, poolclass=NullPool)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


def get_session() -> Iterator[Session]:
    # Leaving the block closes the session, which rolls back anything left uncommitted.
    with SessionLocal() as session:
        yield session
        session.commit()
