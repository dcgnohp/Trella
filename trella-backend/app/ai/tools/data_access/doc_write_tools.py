"""Document write tools (P8): propose + apply wrappers over ``DocsService``.

Both tools are workspace-scoped: ``ctx.workspace_id`` is required (missing ->
``invalid_args`` in the PROPOSE phase). ``apply`` calls the frozen business
method and lets its ``HTTPException`` propagate.

ponytail: thin adapters -- ``DocsService`` owns edit permissions and linkage
validation. Handy for persisting AI-generated release notes/summaries as docs.
"""

from __future__ import annotations

from typing import Any

from app.ai.tools.base import ToolContext, ToolResult, ToolSpec, WriteTool
from app.ai.tools.data_access import (
    _invalid_args,
    _InvalidArgs,
    _require_str,
    _require_uuid,
)
from app.schemas.docs_schema import DocCreate, DocUpdate
from app.services.docs_service import DocsService


def _optional(args: dict[str, Any], *keys: str) -> dict[str, Any]:
    """Collect present, non-null values for ``keys`` (pydantic coerces them)."""
    return {
        k: args[k] for k in keys if isinstance(args, dict) and args.get(k) is not None
    }


def _doc_summary(doc: Any, message: str) -> dict[str, Any]:
    """Tiny, non-sensitive summary of a written doc plus a human ``message``."""
    return {"id": str(doc.id), "title": doc.title, "message": message}


class CreateDocTool(WriteTool):
    """Create a workspace doc via ``DocsService.create_doc``."""

    spec = ToolSpec(
        name="create_document",
        description="Create a document in the current workspace, optionally linked to a task, sprint, or board.",
        parameters={
            "type": "object",
            "properties": {
                "title": {"type": "string", "description": "Document title"},
                "content": {"type": "string"},
                "task_id": {"type": "string"},
                "sprint_id": {"type": "string"},
                "board_id": {"type": "string"},
                "category": {"type": "string"},
            },
            "required": ["title"],
        },
        category="knowledge",
        capability="document.create",
        capabilities=frozenset({"write"}),
        mutating=True,
    )

    _FIELDS = ("content", "task_id", "sprint_id", "board_id", "category")

    def __init__(self, docs_service: DocsService | None = None) -> None:
        self._docs = docs_service or DocsService()

    async def run(self, args: dict[str, Any], ctx: ToolContext) -> ToolResult:
        if ctx.workspace_id is None:
            return _invalid_args()
        try:
            title = _require_str(args, "title")
        except _InvalidArgs:
            return _invalid_args()
        normalized = {"title": title, **_optional(args, *self._FIELDS)}
        return ToolResult(
            ok=True,
            content={"preview": f"Create document '{title}'", "args": normalized},
            source="knowledge",
        )

    async def apply(self, args: dict[str, Any], ctx: ToolContext) -> ToolResult:
        if ctx.workspace_id is None:
            return _invalid_args()
        data = DocCreate.model_validate(
            {"title": _require_str(args, "title"), **_optional(args, *self._FIELDS)}
        )
        doc = self._docs.create_doc(ctx.session, ctx.workspace_id, data, ctx.user)
        message = f"Created document '{doc.title}'."
        return ToolResult(
            ok=True, content=_doc_summary(doc, message), source="knowledge"
        )


class UpdateDocTool(WriteTool):
    """Update a workspace doc via ``DocsService.update_doc``."""

    spec = ToolSpec(
        name="update_document",
        description="Update a document's title, content, or category in the current workspace.",
        parameters={
            "type": "object",
            "properties": {
                "doc_id": {"type": "string", "description": "Document UUID"},
                "title": {"type": "string"},
                "content": {"type": "string"},
                "category": {"type": "string"},
            },
            "required": ["doc_id"],
        },
        category="knowledge",
        capability="document.update",
        capabilities=frozenset({"write"}),
        mutating=True,
    )

    _FIELDS = ("title", "content", "category")

    def __init__(self, docs_service: DocsService | None = None) -> None:
        self._docs = docs_service or DocsService()

    async def run(self, args: dict[str, Any], ctx: ToolContext) -> ToolResult:
        if ctx.workspace_id is None:
            return _invalid_args()
        try:
            doc_id = _require_uuid(args, "doc_id")
        except _InvalidArgs:
            return _invalid_args()
        fields = _optional(args, *self._FIELDS)
        if not fields:  # require doc_id + at least one field to change
            return _invalid_args()
        changed = ", ".join(sorted(fields))
        normalized = {"doc_id": str(doc_id), **fields}
        return ToolResult(
            ok=True,
            content={
                "preview": f"Update document {doc_id}: {changed}",
                "args": normalized,
            },
            source="knowledge",
        )

    async def apply(self, args: dict[str, Any], ctx: ToolContext) -> ToolResult:
        if ctx.workspace_id is None:
            return _invalid_args()
        doc_id = _require_uuid(args, "doc_id")
        data = DocUpdate.model_validate(_optional(args, *self._FIELDS))
        doc = self._docs.update_doc(
            ctx.session, ctx.workspace_id, doc_id, data, ctx.user
        )
        message = f"Updated document '{doc.title}'."
        return ToolResult(
            ok=True, content=_doc_summary(doc, message), source="knowledge"
        )
