"""Task content-generation schemas (Phase 1, Features 1 & 2).

Extend the project's :class:`CamelModel` so the API speaks camelCase on the
wire while accepting snake_case internally (matching ``ai_schema.py``). These
are pure data contracts: no business logic, no provider/model coupling.
"""

from __future__ import annotations

from pydantic import Field

from app.core.base import CamelModel


class GenerateDescriptionRequest(CamelModel):
    """Feature 1 input: seed context for description generation."""

    title: str
    description: str | None = None
    labels: list[str] = Field(default_factory=list)
    priority: str | None = None
    sprint: str | None = None


class DescriptionResponse(CamelModel):
    """Feature 1 output: a structured task description."""

    description: str
    acceptance_criteria: list[str]
    technical_notes: list[str]
    definition_of_done: list[str]


class SummarizeRequest(CamelModel):
    """Feature 2 input: text to summarize."""

    description: str
    title: str | None = None


class SummaryResponse(CamelModel):
    """Feature 2 output: a concise summary plus derived signals."""

    summary: str
    risks: list[str]
    action_items: list[str]
