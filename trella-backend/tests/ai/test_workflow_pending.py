"""Unit tests for ``park_and_notify`` (Phase 10.4).

Parks an ActionPlan in a fresh in-memory ``ActionPlanStore`` and emits one
in-app notification per recipient carrying the ``plan_id``. Uses a real
in-memory SQLite ``session`` (mirrors ``tests/ai/test_pm_tools.py``). A fresh
``ActionPlanStore`` and real ``NotificationService`` are injected so the test is
isolated from the process-wide singleton. Deterministic, AI-free, no network.
"""

from __future__ import annotations

import uuid
from collections.abc import Iterator
from typing import Any

import pytest
from sqlalchemy import event
from sqlalchemy.engine import Engine
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, create_engine, select

from app.ai.agent.action_plan import ActionPlanStore, ActionProposal
from app.ai.workflow.pending import park_and_notify
from app.models import SQLModel  # imports every domain model -> full metadata
from app.models.notifications_model import Notification
from app.models.users_model import User
from app.services.notifications_service import NotificationService


@event.listens_for(Engine, "connect")
def _set_sqlite_pragma(dbapi_connection: Any, _connection_record: Any) -> None:
    # Enable foreign keys for SQLite so FK-backed seeding behaves like Postgres.
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


@pytest.fixture
def session() -> Iterator[Session]:
    """Real ``Session`` on a fresh in-memory SQLite DB (mirrors pm_tools test)."""
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    with Session(engine) as db:
        yield db
    SQLModel.metadata.drop_all(engine)


def _add_user(session: Session, email: str) -> User:
    user = User(email=email, hashed_password="x")  # type: ignore[call-arg]
    session.add(user)
    session.flush()
    return user


def _proposal(workspace_id: uuid.UUID, tool_name: str = "create_document") -> ActionProposal:
    return ActionProposal(
        action_id=uuid.uuid4().hex,
        tool_name=tool_name,
        args={"title": "Sprint 11 summary"},
        preview="Create document 'Sprint 11 summary'",
        capabilities=frozenset({"write"}),
        scope={"workspace_id": str(workspace_id)},
    )


def test_park_and_notify_parks_plan_and_notifies_recipient(session: Session) -> None:
    user = _add_user(session, "approver@example.com")
    workspace_id = uuid.uuid4()
    store = ActionPlanStore()
    proposals = [_proposal(workspace_id), _proposal(workspace_id, "update_task")]

    plan_id = park_and_notify(
        session,
        workspace_id=workspace_id,
        recipient_ids=[user.id],
        proposals=proposals,
        title="Sprint summary ready to review",
        store=store,
        notifications=NotificationService(),
    )

    # Returns a non-empty plan_id that resolves in the injected store.
    assert plan_id
    parked = store.get(plan_id)
    assert parked is not None
    assert parked.proposals == proposals

    # Exactly one notification for the recipient, carrying plan_id in metadata.
    rows = session.exec(select(Notification).where(Notification.user_id == user.id)).all()
    assert len(rows) == 1
    notif = rows[0]
    assert notif.title == "Sprint summary ready to review"
    assert notif.notif_metadata is not None
    assert notif.notif_metadata["plan_id"] == plan_id
    assert notif.notif_metadata["workspace_id"] == str(workspace_id)


def test_park_and_notify_one_notification_per_recipient(session: Session) -> None:
    users = [_add_user(session, f"user{i}@example.com") for i in range(3)]
    workspace_id = uuid.uuid4()
    store = ActionPlanStore()

    plan_id = park_and_notify(
        session,
        workspace_id=workspace_id,
        recipient_ids=[u.id for u in users],
        proposals=[_proposal(workspace_id)],
        title="Please review",
        store=store,
        notifications=NotificationService(),
    )

    for user in users:
        rows = session.exec(
            select(Notification).where(Notification.user_id == user.id)
        ).all()
        assert len(rows) == 1
        assert rows[0].notif_metadata is not None
        assert rows[0].notif_metadata["plan_id"] == plan_id
