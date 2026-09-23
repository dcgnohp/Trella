"""Phase 10.4 wiring test: completing a sprint publishes a ``SprintCompleted``
domain event with the correct ids + actor, so the AI Workflow Automation
subscriber can draft a proposal from it.

We capture events by patching ``EventDispatcher.publish`` (the process-wide
dispatcher has no bound loop in tests, so real scheduling is a no-op) — this
deterministically proves the business publish seam without a running loop.
"""

from __future__ import annotations

import pytest
from sqlmodel import Session

from app.core import events
from app.core.events import SprintCompleted
from app.models.enums import ProjectRole, SprintStatus
from app.models.project_members_model import ProjectMember
from app.services.sprints_service import SprintsService
from tests.services.test_project_analytics_service import _Env


def test_complete_sprint_publishes_sprint_completed(
    session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    env = _Env(session)
    # completing a sprint needs PROJECT_ADMIN — promote the seeded member.
    member = session.exec(  # type: ignore[call-overload]
        ProjectMember.__table__.select().where(
            ProjectMember.project_id == env.project.id,
            ProjectMember.user_id == env.user.id,
        )
    ).first()
    pm = session.get(ProjectMember, member.id) if member is not None else None
    if pm is not None:
        pm.project_role = ProjectRole.PROJECT_ADMIN.value
        session.add(pm)
        session.commit()

    sprint = env.add_sprint(status=SprintStatus.ACTIVE.value)

    captured: list[events.DomainEvent] = []
    monkeypatch.setattr(
        events.EventDispatcher, "publish", lambda self, e: captured.append(e)
    )

    SprintsService().complete_sprint(session, sprint.id, None, env.user)

    completed = [e for e in captured if isinstance(e, SprintCompleted)]
    assert len(completed) == 1
    ev = completed[0]
    assert ev.sprint_id == sprint.id
    assert ev.project_id == env.project.id
    assert ev.workspace_id == env.org.id
    assert ev.completed_by == env.user.id
