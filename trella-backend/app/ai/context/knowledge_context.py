"""Knowledge context builder (payload mode).

Builds prompt variables for document summarization from data the client sends
in the request body. It ONLY builds context and estimates tokens: it never
truncates content and holds no token/char limits — truncation is the sole
responsibility of ``AIBaseService`` (``.ai/PHASE_3_PLAN.md`` P3-B4).
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from app.ai.context.base import ContextBuilder

if TYPE_CHECKING:
    from app.ai.schemas.docs_ai_schema import DocSummaryRequest


class KnowledgeContext(ContextBuilder):
    """Context for document summarization features."""

    def __init__(self, *, content: str, title: str | None = None) -> None:
        self.content = content
        self.title = title

    @classmethod
    def from_payload(cls, req: DocSummaryRequest) -> KnowledgeContext:
        """Factory: Build from a DocSummaryRequest payload."""
        return cls(content=req.content, title=req.title)

    def build(self) -> dict[str, str]:
        """Return prompt variables as strings — content passed through unchanged."""
        variables: dict[str, str] = {
            "title": self.title or "",
            "content": self.content,
        }
        return {k: str(v) for k, v in self.redact(variables).items()}

    def metadata(self) -> dict[str, Any]:
        """Non-sensitive metadata."""
        return {
            "content_length": len(self.content),
            "has_title": bool(self.title),
        }

    def estimated_tokens(self) -> int:
        # ponytail: rough ~4 chars/token heuristic (English prose average).
        # Upgrade path: swap for a real tokenizer if cost precision matters.
        return len(self.content) // 4
