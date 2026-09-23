"""Document summary schemas (Phase 3, AI Document Summary).

Extend the project's :class:`CamelModel` so the API speaks camelCase on the
wire while accepting snake_case internally (matching ``task_ai_schema.py``).
These are pure data contracts: no business logic, no provider/model coupling.
"""

from __future__ import annotations

from pydantic import Field

from app.core.base import CamelModel


class DocSummaryRequest(CamelModel):
    """Feature input: document content to summarize."""

    content: str
    title: str | None = None


class DocSummaryResponse(CamelModel):
    """Feature output: a summary plus derived signals from the document."""

    summary: str
    key_points: list[str] = Field(default_factory=list)
    key_decisions: list[str] = Field(default_factory=list)
    action_items: list[str] = Field(default_factory=list)
