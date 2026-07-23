"""Unit tests for the sprint-summary workflow automation (Phase 10.4).

Exercises ``propose_sprint_summary`` end-to-end against a real in-memory SQLite
``session`` (mirrors ``tests/ai/test_pm_tools.py``): it gathers real analytics,
drafts a summary via an INJECTED fake provider (no network/LLM), and PROPOSES a
``create_document`` action by parking a Phase 8 ``ActionPlan`` + notifying the
actor. The key invariant is proposal-only: NO document row is ever written here.

Also asserts ``register_workflow_automation`` subscribes ``SprintCompleted``.
Deterministic, AI-free, no network.
"""

from __future__ import annotations

import asyncio
import uuid
from collections.abc import Iterator
from typing import Any

import pytest
from sqlalchemy import event
from sqlalchemy.engine import Engine
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, create_engine, select

from app.ai.agent.action_plan import ActionPlanStore
from app.ai.providers.base import AIProvider, GenerationResult
from app.ai.workflow.automation import (
    WORKFLOW_RULES,
    propose_sprint_summary,
    register_workflow_automation,
)
from app.core.events import EventDispatcher, SprintCompleted
from app.models import SQLModel  # imports every domain model -> full metadata
from app.models.docs_model import Doc
from app.models.enums import CanonicalStatus, SprintStatus
from app.models.notifications_model import Notification
from app.services.notifications_service import NotificationService
from tests.services.test_project_analytics_service import _Env

_FAKE_SUMMARY = "## Overview\nSprint 1 is on track.\n\n## Next Steps\nClose out."


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


class _FakeProvider(AIProvider):
    """Returns a fixed completion — no network, deterministic draft."""

    name = "fake"

    def __init__(self, text: str) -> None:
        self._text = text

    async def generate(
        self,
        *,
        prompt: str,
        model: str | None = None,
        temperature: float = 0.0,
        max_tokens: int | None = None,
        timeout: float | None = None,
    ) -> GenerationResult:
        return GenerationResult(content=self._text, model="fake", provider="fake")

    async def health_check(self) -> bool:
        return True


def _completed_event(env: _Env) -> SprintCompleted:
    """Seed a COMPLETED sprint with a few tasks; return the matching event."""
    sprint = env.add_sprint(status=SprintStatus.COMPLETED.value)
    env.add_task(canonical=CanonicalStatus.DONE.value, sprint_id=sprint.id)
    env.add_task(canonical=CanonicalStatus.DONE.value, sprint_id=sprint.id)
    env.add_task(canonical=CanonicalStatus.TODO.value, sprint_id=sprint.id)
    return SprintCompleted(
        sprint_id=sprint.id,
        project_id=env.project.id,
        workspace_id=env.org.id,
        completed_by=env.user.id,
    )


def test_propose_sprint_summary_parks_proposal_and_notifies(session: Session) -> None:
    env = _Env(session)
    event_ = _completed_event(env)
    store = ActionPlanStore()

    plan_id = asyncio.run(
        propose_sprint_summary(
            session,
            event_,
            provider=_FakeProvider(_FAKE_SUMMARY),
            store=store,
            notifications=NotificationService(),
        )
    )

    # Returns a plan_id that resolves in the injected store to ONE proposal.
    assert plan_id
    plan = store.get(plan_id)
    assert plan is not None
    assert len(plan.proposals) == 1
    proposal = plan.proposals[0]
    assert proposal.tool_name == "create_document"
    assert proposal.capabilities == frozenset({"write"})
    # The proposed content is exactly the drafted (fake) summary.
    assert proposal.args["content"] == _FAKE_SUMMARY
    assert proposal.scope["sprint_id"] == str(event_.sprint_id)

    # The actor was notified, and the notification carries the plan_id.
    rows = session.exec(
        select(Notification).where(Notification.user_id == env.user.id)
    ).all()
    assert len(rows) == 1
    assert rows[0].notif_metadata is not None
    assert rows[0].notif_metadata["plan_id"] == plan_id

    # Proposal-only: NO document was written to the DB.
    assert session.exec(select(Doc)).all() == []


def test_propose_sprint_summary_returns_none_for_unknown_actor(
    session: Session,
) -> None:
    """A missing actor short-circuits: no proposal, no notification, no doc."""
    env = _Env(session)
    event_ = _completed_event(env)
    event_ = SprintCompleted(
        sprint_id=event_.sprint_id,
        project_id=event_.project_id,
        workspace_id=event_.workspace_id,
        completed_by=uuid.uuid4(),  # nobody
    )
    store = ActionPlanStore()

    plan_id = asyncio.run(
        propose_sprint_summary(
            session,
            event_,
            provider=_FakeProvider(_FAKE_SUMMARY),
            store=store,
            notifications=NotificationService(),
        )
    )

    assert plan_id is None
    assert session.exec(select(Notification)).all() == []
    assert session.exec(select(Doc)).all() == []


def test_register_workflow_automation_subscribes_sprint_completed() -> None:
    """Every rule (incl. SprintCompleted) is wired onto the dispatcher."""
    dispatcher = EventDispatcher()
    register_workflow_automation(dispatcher)

    subscribed = {rule.event_type for rule in WORKFLOW_RULES}
    assert SprintCompleted in subscribed
    for event_type in subscribed:
        # Publishing schedules handlers; with no bound loop it must be a no-op
        # (proves a handler is registered without invoking it).
        assert dispatcher._subscribers.get(event_type)  # noqa: SLF001
