"""AI Retrieval Layer: subscribe to document lifecycle events and keep the
semantic index in sync in the BACKGROUND (Phase 9).

The business layer only publishes generic ``DocumentCreated/Updated/Deleted``
events (it never imports AI). This module — part of the AI platform — subscribes
at startup and (re)indexes or removes embeddings off the request path. Each
handler opens its OWN short-lived DB session (the publishing request's session
is already closed), reads the doc directly (data layer), and delegates to
``IndexingService``.

ponytail: real-time best-effort sync; the backfill script remains the
recovery/rebuild path if an event is ever lost.
"""

from __future__ import annotations

from sqlmodel import Session

from app.ai.retrieval.indexing import IndexingService
from app.core.db import engine
from app.core.events import (
    DocumentCreated,
    DocumentDeleted,
    DocumentUpdated,
    DomainEvent,
    EventDispatcher,
    get_event_dispatcher,
)
from app.models.docs_model import Doc


async def _reindex(event: DocumentCreated | DocumentUpdated) -> None:
    service = IndexingService()
    with Session(engine) as session:
        doc = session.get(Doc, event.doc_id)
        if doc is None or doc.is_archived:
            # Gone or archived between publish and handling -> ensure no stale rows.
            service.remove_doc(session, doc_id=event.doc_id)
            return
        await service.index_doc(
            session,
            doc_id=doc.id,
            workspace_id=doc.workspace_id,
            title=doc.title,
            content=doc.content,
        )


async def _handle_created(event: DomainEvent) -> None:
    assert isinstance(event, DocumentCreated)
    await _reindex(event)


async def _handle_updated(event: DomainEvent) -> None:
    assert isinstance(event, DocumentUpdated)
    await _reindex(event)


async def _handle_deleted(event: DomainEvent) -> None:
    assert isinstance(event, DocumentDeleted)
    with Session(engine) as session:
        IndexingService().remove_doc(session, doc_id=event.doc_id)


def register_document_indexing(dispatcher: EventDispatcher | None = None) -> None:
    """Wire the background indexing handlers to document lifecycle events.

    Called at startup ONLY when semantic search is enabled.
    """
    bus = dispatcher or get_event_dispatcher()
    bus.subscribe(DocumentCreated, _handle_created)
    bus.subscribe(DocumentUpdated, _handle_updated)
    bus.subscribe(DocumentDeleted, _handle_deleted)
