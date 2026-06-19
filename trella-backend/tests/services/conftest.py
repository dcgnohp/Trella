"""Shared fixtures for service-layer unit tests.

Provides an in-memory SQLite database with the full Phase 1 schema created from
``SQLModel.metadata`` (every domain model is imported via ``app.models``). Each
test gets a fresh database and a real ``Session`` — no mocks — so service logic
(membership checks, limit enforcement, audit writes, transaction handling) is
exercised against an actual transactional store.

The boards/lists/cards tables come from migration ``0002`` which is not applied
to the local Postgres yet, so these tests deliberately run against SQLite to
validate service behavior at the unit level.
"""

from collections.abc import Iterator

import pytest
from sqlalchemy import event
from sqlalchemy.engine import Engine
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, create_engine

from app.models import SQLModel  # imports every domain model -> full metadata


@event.listens_for(Engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    # Ensure foreign keys are enabled for SQLite
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


@pytest.fixture
def session() -> Iterator[Session]:
    """Yield a real ``Session`` backed by a fresh in-memory SQLite database."""
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        yield session
    SQLModel.metadata.drop_all(engine)
