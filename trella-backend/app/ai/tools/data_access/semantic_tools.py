"""Semantic document search tool (Phase 9, Knowledge Intelligence 2.0).

``semantic_search_documents`` embeds the query and finds the nearest document
chunks by cosine distance (pgvector), scoped to the current workspace, then
returns source-cited matches for Retrieval-Augmented answers.

Architecture note — sanctioned Phase 9 exception: Phase 7 tools "must not call
AI". This retrieval tool DOES call the embedding provider to embed the *query*
(a retrieval primitive, not generation). This is explicitly approved by the
Phase 9 plan (semantic search is a Tool Registry tool with capability
``knowledge``). Generation still never happens inside a tool.

Permission (defence in depth): candidate chunks come from ``doc_embeddings``
scoped to the workspace, but results are ALSO intersected with the docs the
user can actually see via ``DocsService.list_docs`` (membership + non-archived),
mirroring the Phase 7 ``search_documents`` permission model. The vector table is
never trusted on its own.
"""

from __future__ import annotations

from typing import Any

from app.ai.providers import AIProvider, get_embedding_provider
from app.ai.retrieval.reranking import rank_knowledge, rerank
from app.ai.tools.base import Tool, ToolContext, ToolResult, ToolSpec
from app.ai.tools.data_access import _invalid_args, _require_str, _truncate
from app.core.config import Settings
from app.core.config import settings as default_settings
from app.models.docs_model import Doc
from app.repositories.doc_embeddings_repository import DocEmbeddingsRepository
from app.services.docs_service import DocsService

# Snippet length for a cited chunk (smaller than MAX_TEXT — citations are short).
_SNIPPET_CHARS = 320
# Over-fetch factor: pull more nearest chunks than needed so permission
# filtering + per-doc dedupe still leave enough to return top_k.
_OVERFETCH = 5


class SemanticDocumentSearchTool(Tool):
    """Find workspace documents by MEANING (embedding cosine search)."""

    spec = ToolSpec(
        name="semantic_search_documents",
        description=(
            "Semantically search the current workspace's documents by MEANING, "
            "not just keywords — use this when the user asks about a topic and "
            "may not know the exact words in the document (e.g. 'how do we "
            "handle failed logins'). Returns the most relevant documents with a "
            "short snippet and a relevance score, each citing its source "
            "document. Prefer keyword search_documents when the user gives an "
            "exact title or term."
        ),
        parameters={
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Natural-language description of what to find",
                },
                "top_k": {
                    "type": "integer",
                    "description": "Max documents to return (default from config)",
                },
            },
            "required": ["query"],
        },
        category="knowledge",
        capability="document.semantic_search",
        capabilities=frozenset({"read", "knowledge"}),
    )

    def __init__(
        self,
        docs_service: DocsService | None = None,
        repo: DocEmbeddingsRepository | None = None,
        *,
        provider: AIProvider | None = None,
        settings: Settings | None = None,
    ) -> None:
        self._docs = docs_service or DocsService()
        self._repo = repo or DocEmbeddingsRepository()
        self._provider = provider
        self._settings = settings or default_settings

    def _get_provider(self) -> AIProvider:
        if self._provider is None:
            self._provider = get_embedding_provider(self._settings)
        return self._provider

    def _top_k(self, args: dict[str, Any]) -> int:
        raw = args.get("top_k") if isinstance(args, dict) else None
        if isinstance(raw, int) and raw > 0:
            return raw
        return self._settings.AI_SEMANTIC_SEARCH_TOP_K

    async def run(self, args: dict[str, Any], ctx: ToolContext) -> ToolResult:
        if ctx.workspace_id is None:
            return _invalid_args()
        try:
            query = _require_str(args, "query")
        except Exception:
            return _invalid_args()
        top_k = self._top_k(args)

        vectors = await self._get_provider().embed(
            [query],
            model=self._settings.AI_EMBEDDING_MODEL,
            dimensions=self._settings.AI_EMBEDDING_DIM,
        )
        if not vectors:
            return ToolResult(ok=True, content=[], source="knowledge")

        # Docs the user may actually see (membership + non-archived enforced).
        visible: dict[Any, Doc] = {
            doc.id: doc
            for doc in self._docs.list_docs(ctx.session, ctx.workspace_id, ctx.user)
        }

        hits = self._repo.search_by_workspace(
            ctx.session, ctx.workspace_id, vectors[0], top_k * _OVERFETCH
        )

        results: list[dict[str, Any]] = []
        seen: set[Any] = set()
        for chunk, distance in hits:  # already ordered nearest-first
            doc = visible.get(chunk.doc_id)
            if doc is None or chunk.doc_id in seen:
                continue  # not visible to this user, or a farther dup of same doc
            seen.add(chunk.doc_id)
            results.append(
                {
                    "doc_id": str(doc.id),
                    "title": doc.title,
                    "score": round(1.0 - distance, 4),  # cosine similarity
                    "snippet": _truncate(chunk.content_chunk, _SNIPPET_CHARS),
                    # Source citation payload for the answer layer (non-sensitive:
                    # id/title/workspace only — never chunk id or score).
                    "source": {
                        "type": "document",
                        "id": str(doc.id),
                        "title": doc.title,
                        "workspace_id": str(ctx.workspace_id),
                    },
                }
            )
            if len(results) >= top_k:
                break
        # Post-retrieval pipeline seams (no-ops today; see app.ai.retrieval.reranking).
        ranked = rank_knowledge(query, rerank(query, results))
        return ToolResult(ok=True, content=ranked, source="knowledge")
