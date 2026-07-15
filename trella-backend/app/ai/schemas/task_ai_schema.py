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


# ----------------------------------------------------------------------------
# Phase 2: Task Intelligence
# ----------------------------------------------------------------------------


class BreakdownRequest(CamelModel):
    """Feature 3 input: seed context for task breakdown."""

    title: str
    description: str | None = None
    labels: list[str] = Field(default_factory=list)
    priority: str | None = None
    sprint: str | None = None


class SubtaskItem(CamelModel):
    title: str
    description: str
    acceptance_criteria: list[str] = Field(default_factory=list)
    suggested_story_point: int | None = None
    suggested_priority: str | None = None


class BreakdownResponse(CamelModel):
    """Feature 3 output: a list of structured subtasks."""

    subtasks: list[SubtaskItem]


class HistorySample(CamelModel):
    title: str
    story_point: int


class StoryPointRequest(CamelModel):
    """Feature 4 input: task info and optional historical context for estimation."""

    # Task info (required)
    title: str
    description: str | None = None
    labels: list[str] = Field(default_factory=list)
    priority: str | None = None

    # Historical / sprint context (optional)
    sprint_goal: str | None = None
    velocity: int | None = None
    history: list[HistorySample] = Field(default_factory=list)


class StoryPointResponse(CamelModel):
    """Feature 4 output: story point estimate with confidence and reasoning."""

    story_point: int
    confidence: int
    reason: str
