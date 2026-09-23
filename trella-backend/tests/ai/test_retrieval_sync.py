"""Phase 9 background indexing handlers wire events -> IndexingService.

The handlers open a real Session(engine) internally, so we patch ``Session`` and
``session.get`` plus inject a fake IndexingService by patching the module's
``IndexingService`` symbol. No network, no real embedding.
"""

from __future__ import annotations

import asyncio
import uuid
from types import SimpleNamespace
from typing import Any

import app.ai.retrieval.sync as sync_mod
from app.core.events import DocumentCreated, DocumentDeleted, DocumentUpdated


class _FakeIndexer:
    last: dict[str, Any] = {}

    def __init__(self) -> None:
        _FakeIndexer.last = {}

    async def index_doc(self, _session: Any, **kwargs: Any) -> int:
        _FakeIndexer.last = {"op": "index", **kwargs}
        return 1

    def remove_doc(self, _session: Any, *, doc_id: uuid.UUID) -> None:
        _FakeIndexer.last = {"op": "remove", "doc_id": doc_id}


class _FakeSessionCtx:
    """Context manager returning a session whose .get yields a scripted doc."""

    def __init__(self, doc: Any) -> None:
        self._doc = doc

    def __enter__(self) -> Any:
        return SimpleNamespace(get=lambda _model, _id: self._doc)

    def __exit__(self, *_: Any) -> None:
        return None


def _patch(monkeypatch: Any, doc: Any) -> None:
    monkeypatch.setattr(sync_mod, "IndexingService", _FakeIndexer)
    monkeypatch.setattr(sync_mod, "Session", lambda _engine: _FakeSessionCtx(doc))


def test_created_event_indexes_doc(monkeypatch: Any) -> None:
    doc_id, ws = uuid.uuid4(), uuid.uuid4()
    doc = SimpleNamespace(
        id=doc_id, workspace_id=ws, title="T", content="body", is_archived=False
    )
    _patch(monkeypatch, doc)
    asyncio.run(
        sync_mod._handle_created(DocumentCreated(doc_id=doc_id, workspace_id=ws))
    )
    assert _FakeIndexer.last["op"] == "index"
    assert _FakeIndexer.last["doc_id"] == doc_id
    assert _FakeIndexer.last["title"] == "T"


def test_updated_event_of_archived_doc_removes_index(monkeypatch: Any) -> None:
    doc_id, ws = uuid.uuid4(), uuid.uuid4()
    doc = SimpleNamespace(
        id=doc_id, workspace_id=ws, title="T", content="body", is_archived=True
    )
    _patch(monkeypatch, doc)
    asyncio.run(
        sync_mod._handle_updated(DocumentUpdated(doc_id=doc_id, workspace_id=ws))
    )
    assert _FakeIndexer.last == {"op": "remove", "doc_id": doc_id}


def test_updated_event_missing_doc_removes_index(monkeypatch: Any) -> None:
    doc_id, ws = uuid.uuid4(), uuid.uuid4()
    _patch(monkeypatch, None)  # doc gone between publish and handling
    asyncio.run(
        sync_mod._handle_updated(DocumentUpdated(doc_id=doc_id, workspace_id=ws))
    )
    assert _FakeIndexer.last == {"op": "remove", "doc_id": doc_id}


def test_deleted_event_removes_index(monkeypatch: Any) -> None:
    doc_id, ws = uuid.uuid4(), uuid.uuid4()
    _patch(monkeypatch, None)
    asyncio.run(
        sync_mod._handle_deleted(DocumentDeleted(doc_id=doc_id, workspace_id=ws))
    )
    assert _FakeIndexer.last == {"op": "remove", "doc_id": doc_id}
