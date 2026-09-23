"""Phase 9 semantic_search_documents tool tests (no DB, no network).

Fake embedding provider, fake repo (nearest chunks + distances), and fake
DocsService (visible docs) are injected, so permission filtering, per-doc
dedupe, top_k cap, and the source-citation payload are verified in isolation.
"""

from __future__ import annotations

import asyncio
import uuid
from types import SimpleNamespace
from typing import Any, cast

from app.ai.tools.base import ToolContext
from app.ai.tools.data_access.semantic_tools import SemanticDocumentSearchTool


class _FakeProvider:
    async def embed(
        self,
        texts: list[str],
        *,
        model: str | None = None,
        dimensions: int | None = None,
        timeout: float | None = None,
    ) -> list[list[float]]:
        return [[0.1, 0.2, 0.3] for _ in texts]


def _chunk(doc_id: uuid.UUID, text: str) -> Any:
    return SimpleNamespace(doc_id=doc_id, content_chunk=text, chunk_index=0)


class _FakeRepo:
    def __init__(self, hits: list[tuple[Any, float]]) -> None:
        self._hits = hits
        self.calls: list[int] = []

    def search_by_workspace(
        self, _session: Any, _ws: uuid.UUID, _vec: list[float], top_k: int
    ) -> list[tuple[Any, float]]:
        self.calls.append(top_k)
        return self._hits


def _docs_service(docs: list[Any]) -> Any:
    return SimpleNamespace(list_docs=lambda _s, _w, _u: docs)


def _settings(top_k: int = 5) -> Any:
    return SimpleNamespace(
        AI_SEMANTIC_SEARCH_TOP_K=top_k, AI_EMBEDDING_MODEL="emb", AI_EMBEDDING_DIM=768
    )


def _ctx(workspace_id: uuid.UUID | None) -> ToolContext:
    return ToolContext(
        session=cast(Any, object()),
        user=cast(Any, SimpleNamespace(id=uuid.uuid4())),
        workspace_id=workspace_id,
    )


def _tool(repo: Any, docs: list[Any], settings: Any) -> SemanticDocumentSearchTool:
    return SemanticDocumentSearchTool(
        docs_service=cast(Any, _docs_service(docs)),
        repo=cast(Any, repo),
        provider=cast(Any, _FakeProvider()),
        settings=cast(Any, settings),
    )


def _run(tool: Any, args: dict[str, Any], ctx: ToolContext) -> Any:
    return asyncio.run(tool.run(args, ctx))


def test_returns_cited_results_ordered_and_deduped() -> None:
    ws = uuid.uuid4()
    d1, d2 = uuid.uuid4(), uuid.uuid4()
    docs = [
        SimpleNamespace(id=d1, title="Auth guide"),
        SimpleNamespace(id=d2, title="Deploy"),
    ]
    # d1 appears twice (nearest + a farther dup) -> deduped to one, best score.
    hits = [
        (_chunk(d1, "handling failed logins"), 0.1),
        (_chunk(d2, "deployment steps"), 0.4),
        (_chunk(d1, "another auth chunk"), 0.8),
    ]
    res = _run(
        _tool(_FakeRepo(hits), docs, _settings()), {"query": "login errors"}, _ctx(ws)
    )

    assert res.ok is True
    assert [r["doc_id"] for r in res.content] == [
        str(d1),
        str(d2),
    ]  # nearest-first, deduped
    top = res.content[0]
    assert top["title"] == "Auth guide"
    assert top["score"] == round(1.0 - 0.1, 4)
    assert top["snippet"] == "handling failed logins"
    assert top["source"] == {
        "type": "document",
        "id": str(d1),
        "title": "Auth guide",
        "workspace_id": str(ws),
    }


def test_excludes_docs_not_visible_to_user() -> None:
    ws = uuid.uuid4()
    visible_id, hidden_id = uuid.uuid4(), uuid.uuid4()
    docs = [SimpleNamespace(id=visible_id, title="Visible")]  # hidden_id NOT listed
    hits = [
        (_chunk(hidden_id, "secret"), 0.05),  # nearest but not visible -> dropped
        (_chunk(visible_id, "ok"), 0.3),
    ]
    res = _run(_tool(_FakeRepo(hits), docs, _settings()), {"query": "x"}, _ctx(ws))
    assert [r["doc_id"] for r in res.content] == [str(visible_id)]


def test_respects_top_k_cap_and_overfetches() -> None:
    ws = uuid.uuid4()
    ids = [uuid.uuid4() for _ in range(4)]
    docs = [SimpleNamespace(id=i, title=f"D{n}") for n, i in enumerate(ids)]
    hits = [(_chunk(i, "c"), 0.1 * n) for n, i in enumerate(ids)]
    repo = _FakeRepo(hits)
    res = _run(
        _tool(repo, docs, _settings(top_k=2)), {"query": "x", "top_k": 2}, _ctx(ws)
    )
    assert len(res.content) == 2  # capped
    assert repo.calls == [2 * 5]  # over-fetched top_k * _OVERFETCH


def test_missing_workspace_is_invalid() -> None:
    res = _run(_tool(_FakeRepo([]), [], _settings()), {"query": "x"}, _ctx(None))
    assert res.ok is False and res.error == "invalid_args"


def test_missing_query_is_invalid() -> None:
    res = _run(_tool(_FakeRepo([]), [], _settings()), {}, _ctx(uuid.uuid4()))
    assert res.ok is False and res.error == "invalid_args"
