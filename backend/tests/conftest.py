import os
from collections.abc import AsyncIterator, Iterator
from contextlib import contextmanager

import pytest
from dotenv import load_dotenv
from httpx import ASGITransport, AsyncClient
from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import Session, sessionmaker

from app.config import settings
from app.db import get_session
from app.main import app
from app.models import Application, StatusUpdate

load_dotenv()

TEST_DATABASE_URL = os.environ["TEST_DATABASE_URL"].replace(
    "postgresql://", "postgresql+psycopg://", 1
)

# The app uses NullPool because it runs serverless. The suite does not, and pooling here turns
# three minutes of Neon connection setup into a few seconds.
test_engine = create_engine(TEST_DATABASE_URL)
TestSession = sessionmaker(bind=test_engine, expire_on_commit=False)


def override_get_session() -> Iterator[Session]:
    with TestSession() as session:
        yield session
        session.commit()


@pytest.fixture(autouse=True)
def clean_database() -> None:
    with test_engine.begin() as connection:
        connection.execute(text("truncate applications, profile cascade"))


@pytest.fixture
async def client() -> AsyncIterator[AsyncClient]:
    app.dependency_overrides[get_session] = override_get_session
    transport = ASGITransport(app=app)
    async with AsyncClient(
        transport=transport,
        base_url="http://test",
        headers={"X-API-Key": settings.backend_api_key},
    ) as authenticated:
        yield authenticated
    app.dependency_overrides.clear()


@pytest.fixture
async def anonymous_client() -> AsyncIterator[AsyncClient]:
    app.dependency_overrides[get_session] = override_get_session
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as unauthenticated:
        yield unauthenticated
    app.dependency_overrides.clear()


@pytest.fixture
def session() -> Iterator[Session]:
    with TestSession() as open_session:
        yield open_session


@pytest.fixture
def seed():
    """Writes an application straight through the ORM, bypassing the API under test."""

    def _seed(updates: list[dict], **fields) -> str:
        application = Application(
            title=fields.pop("title", "Backend engineer"),
            company=fields.pop("company", "ACME"),
            sector=fields.pop("sector", "Tech"),
            location=fields.pop("location", "Paris"),
            updates=[StatusUpdate(**update) for update in updates],
            **fields,
        )
        with TestSession() as session:
            session.add(application)
            session.commit()
            return str(application.id)

    return _seed


@pytest.fixture
def count_statements():
    @contextmanager
    def counter() -> Iterator[list[str]]:
        statements: list[str] = []

        def record(conn, cursor, statement, parameters, context, executemany):
            statements.append(statement)

        event.listen(test_engine, "before_cursor_execute", record)
        try:
            yield statements
        finally:
            event.remove(test_engine, "before_cursor_execute", record)

    return counter


@pytest.fixture
def break_status_update_inserts():
    """Makes any INSERT into status_updates fail, to prove the create is one transaction."""

    @contextmanager
    def breaker() -> Iterator[None]:
        def explode(conn, cursor, statement, parameters, context, executemany):
            if "INSERT INTO status_updates" in statement:
                raise RuntimeError("status update insert failed")

        event.listen(test_engine, "before_cursor_execute", explode)
        try:
            yield
        finally:
            event.remove(test_engine, "before_cursor_execute", explode)

    return breaker
