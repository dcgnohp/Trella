"""Phase 9 indexing pipeline tests (no DB, no network).

A fake embedding provider and a fake repository are injected so the pipeline's
chunk -> embed -> rows logic is verified without pgvector/Postgres.
"""

from __future__ import annotations

import asyncio
import uuid
from types import SimpleNamespace
from typing import Any, cast

from app.ai.retrieval.indexing import IndexingService


class _FakeProvider:
    """Records embed() calls and returns one deterministic vector per text."""

    def __init__(self) -> None:
        self.calls: list[tuple[list[str], str | None]] = []

    async def embed(
        self,
        texts: list[str],
        *,
        model: str | None = None,
        dimensions: int | None = None,
        timeout: float | None = None,
    ) -> list[list[float]]:
        self.calls.append((texts, model))
        return [[float(len(t)), 1.0, 2.0] for t in texts]


class _FakeRepo:
    def __init__(self) -> None:
        self.replaced: list[tuple[uuid.UUID, list[Any]]] = []

    def replace_for_doc(
        self, _session: Any, doc_id: uuid.UUID, rows: list[Any]
    ) -> None:
        self.replaced.append((doc_id, rows))


def _session() -> Any:
    commits = {"n": 0}
    ns = SimpleNamespace(commit=lambda: commits.__setitem__("n", commits["n"] + 1))
    ns.commits = commits  # type: ignore[attr-defined]
    return ns


def _settings(size: int = 10, overlap: int = 2, model: str | None = "emb-model") -> Any:
    return SimpleNamespace(
        AI_EMBEDDING_CHUNK_SIZE=size,
        AI_EMBEDDING_CHUNK_OVERLAP=overlap,
        AI_EMBEDDING_MODEL=model,
        AI_EMBEDDING_DIM=768,
    )


def _service(provider: Any, repo: Any, settings: Any) -> IndexingService:
    return IndexingService(
        provider=cast(Any, provider), repo=cast(Any, repo), settings=cast(Any, settings)
    )


def test_index_doc_chunks_embeds_and_writes_rows() -> None:
    provider, repo, session = _FakeProvider(), _FakeRepo(), _session()
    service = _service(provider, repo, _settings(size=10, overlap=2))
    doc_id, ws_id = uuid.uuid4(), uuid.uuid4()

    n = asyncio.run(
        service.index_doc(
            session,
            doc_id=doc_id,
            workspace_id=ws_id,
            title="Title",
            content="X" * 30,  # long enough to force multiple chunks
        )
    )

    # One embed call, model forwarded from config, rows written + committed.
    assert len(provider.calls) == 1
    _texts, model = provider.calls[0]
    assert model == "emb-model"
    assert n > 1  # multiple chunks
    assert len(repo.replaced) == 1
    written_doc_id, rows = repo.replaced[0]
    assert written_doc_id == doc_id
    assert len(rows) == n
    # chunk_index is contiguous from 0; each row carries its vector + workspace.
    assert [r.chunk_index for r in rows] == list(range(n))
    assert all(r.workspace_id == ws_id and r.doc_id == doc_id for r in rows)
    assert all(len(r.embedding) == 3 for r in rows)
    assert session.commits["n"] == 1


def test_index_doc_embeds_title_together_with_content() -> None:
    provider, repo, session = _FakeProvider(), _FakeRepo(), _session()
    service = _service(provider, repo, _settings(size=1000, overlap=0))

    asyncio.run(
        service.index_doc(
            session,
            doc_id=uuid.uuid4(),
            workspace_id=uuid.uuid4(),
            title="My Title",
            content="body text",
        )
    )
    texts, _model = provider.calls[0]
    assert "My Title" in texts[0] and "body text" in texts[0]


def test_index_doc_empty_content_clears_rows_without_embedding() -> None:
    provider, repo, session = _FakeProvider(), _FakeRepo(), _session()
    service = _service(provider, repo, _settings())

    n = asyncio.run(
        service.index_doc(
            session,
            doc_id=uuid.uuid4(),
            workspace_id=uuid.uuid4(),
            title="",  # empty title + no content -> nothing to embed
            content=None,
        )
    )
    assert n == 0
    assert provider.calls == []  # provider NOT called
    assert len(repo.replaced) == 1 and repo.replaced[0][1] == []  # cleared
    assert session.commits["n"] == 1
