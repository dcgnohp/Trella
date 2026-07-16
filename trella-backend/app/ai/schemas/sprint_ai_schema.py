"""Sprint analysis schemas (Phase 5, AI Sprint Analytics).

Extend the project's :class:`CamelModel` so the API speaks camelCase on the
wire while accepting snake_case internally (matching ``docs_ai_schema.py``).
These are pure data contracts: no business logic, no provider/model coupling.
"""

from __future__ import annotations

from typing import Literal

from pydantic import Field

from app.core.base import CamelModel


class RiskItem(CamelModel):
    """A single identified sprint risk with severity and rationale."""

    title: str
    severity: Literal["low", "medium", "high", "critical"]
    likelihood: Literal["low", "medium", "high"] | None = None
    rationale: str


class BlockerItem(CamelModel):
    """A single blocker impeding sprint progress."""

    title: str
    impact: str
    suggested_resolution: str | None = None


class RecommendationItem(CamelModel):
    """A prioritized recommendation with confidence and expected impact."""

    title: str
    priority: Literal["low", "medium", "high"]
    confidence: float = Field(ge=0.0, le=1.0)
    expected_impact: str
    rationale: str


class ActionItem(CamelModel):
    """A suggested next action with priority and optional effort sizing."""

    action: str
    priority: Literal["low", "medium", "high"]
    effort: Literal["s", "m", "l"] | None = None


class SprintHealth(CamelModel):
    """Overall sprint health status with an optional numeric score."""

    status: Literal["on_track", "at_risk", "off_track"]
    score: int | None = Field(default=None, ge=0, le=100)
    rationale: str


class TeamPerformance(CamelModel):
    """Team performance narrative with highlights and concerns."""

    summary: str
    highlights: list[str] = Field(default_factory=list)
    concerns: list[str] = Field(default_factory=list)


class SprintAnalysisRequest(CamelModel):
    """Payload: sprint metrics supplied by the frontend (payload-mode)."""

    goal: str | None = None
    status: str | None = None
    start_date: str | None = None
    end_date: str | None = None
    planned_points: float = Field(default=0.0, ge=0.0)
    completed_points: float = Field(default=0.0, ge=0.0)
    todo_count: int = Field(default=0, ge=0)
    in_progress_count: int = Field(default=0, ge=0)
    done_count: int = Field(default=0, ge=0)
    velocity: float | None = Field(default=None, ge=0.0)
    blocked_tasks: list[str] = Field(default_factory=list)
    carried_over_tasks: list[str] = Field(default_factory=list)


class SprintAnalysisResponse(CamelModel):
    """Structured AI analysis of a sprint (rich items power the dashboard UI)."""

    executive_summary: str
    health: SprintHealth
    metrics_commentary: str | None = None
    risks: list[RiskItem] = Field(default_factory=list)
    blockers: list[BlockerItem] = Field(default_factory=list)
    team_performance: TeamPerformance | None = None
    recommendations: list[RecommendationItem] = Field(default_factory=list)
    suggested_actions: list[ActionItem] = Field(default_factory=list)
