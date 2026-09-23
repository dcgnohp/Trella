"""PM analytics data-access tools (Phase 10.2).

Three thin read-tool adapters over :class:`ProjectAnalyticsService`. They are
read-only, deterministic, and AI-free: each validates its args then returns the
service's trimmed, JSON-safe dict verbatim. Nothing here calls a model, invokes
another tool, runs a workflow, or mutates data (Phase 7 invariant preserved).

These tools NEVER decide — they surface analytics signals (sprint health,
per-assignee workload, at-risk items); turning those into a recommendation,
report or plan is the AI Chat's reasoning job. Wiring gates them behind the
``AI_PM_ENABLED`` flag; this module is unaware of that flag by design.
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from app.ai.tools.base import Tool, ToolContext, ToolResult, ToolSpec
from app.ai.tools.data_access import _invalid_args, _InvalidArgs, _require_uuid
from app.services.project_analytics_service import ProjectAnalyticsService

_READ_ANALYTICS = frozenset({"read", "analytics"})


def _optional_uuid(args: dict[str, Any], key: str) -> UUID | None:
    """Parse ``args[key]`` as a UUID, or None when absent/empty.

    Raises :class:`_InvalidArgs` when the key is present but not a valid UUID so
    callers can map that to ``error="invalid_args"``.
    """
    if not isinstance(args, dict) or args.get(key) in (None, ""):
        return None
    return _require_uuid(args, key)


class SprintAnalysisTool(Tool):
    """Return deterministic progress/health signals for one sprint."""

    spec = ToolSpec(
        name="analyze_sprint",
        description=(
            "Return deterministic progress, commitment, schedule and health "
            "signals for a single sprint. Read-only analytics, no advice."
        ),
        parameters={
            "type": "object",
            "properties": {
                "sprint_id": {"type": "string", "description": "Sprint UUID"}
            },
            "required": ["sprint_id"],
        },
        category="analytics",
        capability="analytics.sprint",
        capabilities=_READ_ANALYTICS,
        mutating=False,
    )

    def __init__(self, analytics: ProjectAnalyticsService | None = None) -> None:
        self._analytics = analytics or ProjectAnalyticsService()

    async def run(self, args: dict[str, Any], ctx: ToolContext) -> ToolResult:
        try:
            sprint_id = _require_uuid(args, "sprint_id")
        except _InvalidArgs:
            return _invalid_args()
        result = self._analytics.analyze_sprint(ctx.session, sprint_id, ctx.user)
        return ToolResult(ok=True, content=result, source="analytics")


class WorkloadAnalysisTool(Tool):
    """Return per-assignee open load over a project or one sprint."""

    spec = ToolSpec(
        name="analyze_workload",
        description=(
            "Return per-assignee open workload (open tasks/points, overloaded "
            "and idle flags) over exactly one of a project or a sprint."
        ),
        parameters={
            "type": "object",
            "properties": {
                "project_id": {"type": "string", "description": "Project UUID"},
                "sprint_id": {"type": "string", "description": "Sprint UUID"},
            },
        },
        category="analytics",
        capability="analytics.workload",
        capabilities=_READ_ANALYTICS,
        mutating=False,
    )

    def __init__(self, analytics: ProjectAnalyticsService | None = None) -> None:
        self._analytics = analytics or ProjectAnalyticsService()

    async def run(self, args: dict[str, Any], ctx: ToolContext) -> ToolResult:
        try:
            project_id = _optional_uuid(args, "project_id")
            sprint_id = _optional_uuid(args, "sprint_id")
        except _InvalidArgs:
            return _invalid_args()
        result = self._analytics.analyze_workload(
            ctx.session, ctx.user, project_id=project_id, sprint_id=sprint_id
        )
        if result.get("error") == "invalid_args":
            return ToolResult(ok=False, error="invalid_args")
        return ToolResult(ok=True, content=result, source="analytics")


class RiskAnalysisTool(Tool):
    """Return deterministic at-risk signals over a project or one sprint."""

    spec = ToolSpec(
        name="analyze_risk",
        description=(
            "Return deterministic at-risk signals (overdue, blocked, schedule "
            "pressure) over exactly one of a project or a sprint."
        ),
        parameters={
            "type": "object",
            "properties": {
                "project_id": {"type": "string", "description": "Project UUID"},
                "sprint_id": {"type": "string", "description": "Sprint UUID"},
            },
        },
        category="analytics",
        capability="analytics.risk",
        capabilities=_READ_ANALYTICS,
        mutating=False,
    )

    def __init__(self, analytics: ProjectAnalyticsService | None = None) -> None:
        self._analytics = analytics or ProjectAnalyticsService()

    async def run(self, args: dict[str, Any], ctx: ToolContext) -> ToolResult:
        try:
            project_id = _optional_uuid(args, "project_id")
            sprint_id = _optional_uuid(args, "sprint_id")
        except _InvalidArgs:
            return _invalid_args()
        result = self._analytics.analyze_risk(
            ctx.session, ctx.user, project_id=project_id, sprint_id=sprint_id
        )
        if result.get("error") == "invalid_args":
            return ToolResult(ok=False, error="invalid_args")
        return ToolResult(ok=True, content=result, source="analytics")


def all_pm_tools() -> list[Tool]:
    """Fresh instances of every PM analytics tool (for registry wiring)."""
    return [SprintAnalysisTool(), WorkloadAnalysisTool(), RiskAnalysisTool()]
