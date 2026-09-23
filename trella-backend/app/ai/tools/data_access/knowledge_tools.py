"""Knowledge/document data-access tools."""

from __future__ import annotations

from typing import Any
from uuid import UUID

from app.ai.tools.base import Tool, ToolContext, ToolResult, ToolSpec
from app.ai.tools.data_access import (
    MAX_ITEMS,
    _invalid_args,
    _InvalidArgs,
    _require_uuid,
    _truncate,
)
from app.models.docs_model import Doc
from app.services.docs_service import DocsService

# ponytail: keyword/substring matching only — NOT semantic search. Matching a
# doc when the FULL query OR any significant word (>=3 chars) appears in its
# title/content/category/linked-label gives decent recall when the user doesn't
# recall the exact title (e.g. "devops" finding a doc categorised "DevOps").
# Ceiling: no fuzzy/semantic understanding, no synonyms. Upgrade path = full-text
# index or embeddings/RAG (explicitly out of Phase 7 scope).
_MIN_TOKEN_LEN = 3


def _doc_summary(doc: Doc, workspace_id: UUID) -> dict[str, Any]:
    return {
        "id": str(doc.id),
        "title": doc.title,
        "category": doc.category,
        "linked_entity_label": doc.linked_entity_label,
        "source_type": doc.source_type,
        # Document source citation (same shape as semantic_search_documents) so
        # keyword doc results are ALSO surfaced as clickable citations in the UI
        # (the router's _extract_citations picks up any item with this source).
        # Uses ctx.workspace_id (like semantic_tools) — the tool already requires it.
        "source": {
            "type": "document",
            "id": str(doc.id),
            "title": doc.title,
            "workspace_id": str(workspace_id),
        },
    }


def _haystack(doc: Doc) -> str:
    """Everything a query can match against for one doc, lowercased."""
    parts = [
        doc.title or "",
        doc.content or "",
        doc.category or "",
        doc.linked_entity_label or "",
    ]
    return " ".join(parts).lower()


def _matches(needle: str, haystack: str) -> bool:
    """True if the whole query, or any of its >=3-char words, is in ``haystack``."""
    if needle in haystack:
        return True
    return any(tok in haystack for tok in needle.split() if len(tok) >= _MIN_TOKEN_LEN)


def _query_arg(args: dict[str, Any]) -> str:
    """Accept either ``title`` or ``query`` as the search text."""
    for key in ("title", "query"):
        raw = args.get(key) if isinstance(args, dict) else None
        if isinstance(raw, str) and raw.strip():
            return raw
    raise _InvalidArgs("query")


class DocumentLookupTool(Tool):
    """Find the first document in the workspace matching a title/keyword."""

    spec = ToolSpec(
        name="lookup_document",
        description=(
            "Find a document in the current workspace by keyword — matched "
            "against title, content, category and linked entity. Returns the "
            "first match's summary, or null when none match. For a list of "
            "matches use search_documents."
        ),
        parameters={
            "type": "object",
            "properties": {
                "title": {"type": "string", "description": "Title/keyword to match"},
                "query": {"type": "string", "description": "Alias for title"},
            },
        },
        category="knowledge",
        capability="document.lookup",
    )

    def __init__(self, docs_service: DocsService | None = None) -> None:
        self._docs = docs_service or DocsService()

    async def run(self, args: dict[str, Any], ctx: ToolContext) -> ToolResult:
        if ctx.workspace_id is None:
            return _invalid_args()
        try:
            needle = _query_arg(args).strip().lower()
        except _InvalidArgs:
            return _invalid_args()
        for doc in self._docs.list_docs(ctx.session, ctx.workspace_id, ctx.user):
            if _matches(needle, _haystack(doc)):
                return ToolResult(
                    ok=True,
                    content=_doc_summary(doc, ctx.workspace_id),
                    source="knowledge",
                )
        return ToolResult(ok=True, content=None, source="knowledge")


class DocumentSearchTool(Tool):
    """Keyword search over workspace documents, optionally scoped to a task."""

    spec = ToolSpec(
        name="search_documents",
        description=(
            "Search the current workspace's documents. Matches a keyword "
            "(case-insensitive, whole phrase OR any word) against title, "
            "content, category and linked entity — so a category like 'devops' "
            "is found even if the word isn't in the title. Optionally pass "
            "task_id to find documents linked to a specific task (resolve the "
            "task's id first with lookup_task/search_tasks). Provide query, "
            "task_id, or both. Returns a capped list of matches."
        ),
        parameters={
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Keyword/phrase to match"},
                "task_id": {
                    "type": "string",
                    "description": "Optional: only docs linked to this task UUID",
                },
            },
        },
        category="knowledge",
        capability="document.search",
    )

    def __init__(self, docs_service: DocsService | None = None) -> None:
        self._docs = docs_service or DocsService()

    async def run(self, args: dict[str, Any], ctx: ToolContext) -> ToolResult:
        if ctx.workspace_id is None:
            return _invalid_args()

        task_id: UUID | None = None
        if isinstance(args, dict) and args.get("task_id"):
            try:
                task_id = _require_uuid(args, "task_id")
            except _InvalidArgs:
                return _invalid_args()

        needle: str | None = None
        try:
            needle = _query_arg(args).strip().lower()
        except _InvalidArgs:
            needle = None

        # Need at least one filter: a keyword or a task link.
        if needle is None and task_id is None:
            return _invalid_args()

        matches: list[dict[str, Any]] = []
        for doc in self._docs.list_docs(ctx.session, ctx.workspace_id, ctx.user):
            if task_id is not None and (doc.task_id is None or doc.task_id != task_id):
                continue
            if needle is not None and not _matches(needle, _haystack(doc)):
                continue
            matches.append(_doc_summary(doc, ctx.workspace_id))
            if len(matches) >= MAX_ITEMS:
                break
        return ToolResult(ok=True, content=matches, source="knowledge")


class DocumentDetailTool(Tool):
    """Return a single document's detail (with truncated content)."""

    spec = ToolSpec(
        name="get_document_detail",
        description=(
            "Return a document's detail by id: title, (truncated) content, "
            "category, author, linked entity, and source type."
        ),
        parameters={
            "type": "object",
            "properties": {
                "doc_id": {"type": "string", "description": "Document UUID"}
            },
            "required": ["doc_id"],
        },
        category="knowledge",
        capability="document.detail",
    )

    def __init__(self, docs_service: DocsService | None = None) -> None:
        self._docs = docs_service or DocsService()

    async def run(self, args: dict[str, Any], ctx: ToolContext) -> ToolResult:
        if ctx.workspace_id is None:
            return _invalid_args()
        try:
            doc_id = _require_uuid(args, "doc_id")
        except _InvalidArgs:
            return _invalid_args()
        doc = self._docs.get_doc(ctx.session, ctx.workspace_id, doc_id, ctx.user)
        return ToolResult(
            ok=True,
            content={
                "id": str(doc.id),
                "title": doc.title,
                "content": _truncate(doc.content),
                "category": doc.category,
                "author_name": doc.author_name,
                "linked_entity_label": doc.linked_entity_label,
                "source_type": doc.source_type,
                "source": {
                    "type": "document",
                    "id": str(doc.id),
                    "title": doc.title,
                    "workspace_id": str(ctx.workspace_id),
                },
            },
            source="knowledge",
        )
