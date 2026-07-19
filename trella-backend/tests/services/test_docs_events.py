"""DocsService publishes generic document lifecycle events (Phase 9).

Verifies the business->events wiring only: a spy dispatcher records what
DocsService publishes on create/update/delete. DocsService stays AI-agnostic —
it never imports AI; it just emits ``DocumentCreated/Updated/Deleted``.
"""

from __future__ import annotations

from typing import Any

import pytest
from sqlmodel import Session

import app.services.docs_service as docs_mod
from app.core.events import (
    DocumentCreated,
    DocumentDeleted,
    DocumentUpdated,
    DomainEvent,
)
from app.models.enums import MemberStatus, UserAccountStatus
from app.models.users_model import User
from app.models.workspace_members_model import WorkspaceMember
from app.models.workspaces_model import Workspace
from app.schemas.docs_schema import DocCreate, DocUpdate
from app.services.docs_service import DocsService


class _SpyDispatcher:
    def __init__(self) -> None:
        self.events: list[DomainEvent] = []

    def publish(self, event: DomainEvent) -> None:
        self.events.append(event)


@pytest.fixture
def spy(monkeypatch: Any) -> _SpyDispatcher:
    spy = _SpyDispatcher()
    monkeypatch.setattr(docs_mod, "get_event_dispatcher", lambda: spy)
    return spy


def _seed(session: Session) -> tuple[User, Workspace]:
    user = User(
        email="a@example.com",
        full_name="A",
        hashed_password="x",
        status=UserAccountStatus.ACTIVE.value,
    )
    ws = Workspace(name="WS")
    session.add(user)
    session.add(ws)
    session.commit()
    session.refresh(user)
    session.refresh(ws)
    session.add(
        WorkspaceMember(
            workspace_id=ws.id,
            user_id=user.id,
            role="OWNER",
            status=MemberStatus.ACTIVE.value,
        )
    )
    session.commit()
    return user, ws


def test_lifecycle_events_published(session: Session, spy: _SpyDispatcher) -> None:
    user, ws = _seed(session)
    service = DocsService()

    doc = service.create_doc(session, ws.id, DocCreate(title="Doc", content="hi"), user)
    assert isinstance(spy.events[-1], DocumentCreated)
    assert spy.events[-1].doc_id == doc.id
    assert spy.events[-1].workspace_id == ws.id

    service.update_doc(session, ws.id, doc.id, DocUpdate(title="Doc 2"), user)
    assert isinstance(spy.events[-1], DocumentUpdated)
    assert spy.events[-1].doc_id == doc.id

    service.delete_doc(session, ws.id, doc.id, user)
    assert isinstance(spy.events[-1], DocumentDeleted)
    assert spy.events[-1].doc_id == doc.id
