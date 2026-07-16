"""Project assistant schemas (Phase 5, AI Project Analytics).

Extend the project's :class:`CamelModel` so the API speaks camelCase on the
wire while accepting snake_case internally (matching ``docs_ai_schema.py``).
Shared item models (:class:`RiskItem`, :class:`RecommendationItem`,
:class:`ActionItem`) are imported from ``sprint_ai_schema`` as the single
source of truth rather than redefined here.
"""

from __future__ import annotations

from typing import Literal

from pydantic import Field

from app.ai.schemas.sprint_ai_schema import ActionItem, RecommendationItem, RiskItem
from app.core.base import CamelModel


class DeliveryTrend(CamelModel):
    """Direction of a project's delivery trend with a supporting summary."""

    direction: Literal["improving", "steady", "declining"]
    summary: str


class ProjectSprintSummary(CamelModel):
    """One recent sprint's lightweight summary (payload-mode input)."""

    name: str
    status: str | None = None
    completion_rate: float | None = Field(default=None, ge=0.0, le=1.0)


class ProjectAssistantRequest(CamelModel):
    """Payload: aggregated project/sprint metrics (payload-mode)."""

    name: str | None = None
    mode: str | None = None
    recent_sprints: list[ProjectSprintSummary] = Field(default_factory=list)
    active_sprint: ProjectSprintSummary | None = None
    total_tasks: int = Field(default=0, ge=0)
    done_tasks: int = Field(default=0, ge=0)
    blocked_tasks: int = Field(default=0, ge=0)
    known_risks: list[str] = Field(default_factory=list)


class ProjectAssistantResponse(CamelModel):
    """Structured AI executive overview of a project."""

    health_summary: str
    health_score: int | None = Field(default=None, ge=0, le=100)
    health_status: Literal["healthy", "at_risk", "critical"]
    delivery_trend: DeliveryTrend | None = None
    recent_sprint_trend: str | None = None
    risks: list[RiskItem] = Field(default_factory=list)
    recommendations: list[RecommendationItem] = Field(default_factory=list)
    suggested_next_actions: list[ActionItem] = Field(default_factory=list)
