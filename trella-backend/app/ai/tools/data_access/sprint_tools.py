"""Sprint-scoped data-access tools."""

from __future__ import annotations

from typing import Any
from uuid import UUID

from app.ai.tools.base import Tool, ToolContext, ToolResult, ToolSpec
from app.ai.tools.data_access import _invalid_args, _InvalidArgs, _iso, _require_uuid
from app.ai.tools.permissions import PermissionLayer
from app.models.sprints_model import Sprint
from app.repositories.sprints_repository import SprintsRepository
from app.services.sprints_service import SprintsService


def _sprint_dict(sprint: Sprint) -> dict[str, Any]:
    return {
        "id": str(sprint.id),
        "name": sprint.name,
        "goal": sprint.goal,
        "status": sprint.status,
        "start_date": _iso(sprint.start_date),
        "end_date": _iso(sprint.end_date),
    }


class CurrentSprintTool(Tool):
    """Return the active sprint for a project (or None if there is none)."""

    spec = ToolSpec(
        name="get_current_sprint",
        description=(
            "Return the currently active sprint for a project, or null when no "
            "sprint is active."
        ),
        parameters={
            "type": "object",
            "properties": {
                "project_id": {"type": "string", "description": "Project UUID"}
            },
            "required": ["project_id"],
        },
        category="sprint",
        capability="sprint.current",
    )

    def __init__(
        self,
        sprints_repo: SprintsRepository | None = None,
        permissions: PermissionLayer | None = None,
    ) -> None:
        self._repo = sprints_repo or SprintsRepository()
        self._perms = permissions or PermissionLayer()

    async def run(self, args: dict[str, Any], ctx: ToolContext) -> ToolResult:
        try:
            project_id = _require_uuid(args, "project_id")
        except _InvalidArgs:
            return _invalid_args()
        self._perms.check_project(ctx.session, ctx.user, project_id)
        sprint = self._repo.get_active_sprint(ctx.session, project_id)
        if sprint is None:
            return ToolResult(ok=True, content=None, source="sprint")
        return ToolResult(ok=True, content=_sprint_dict(sprint), source="sprint")


class SprintDetailTool(Tool):
    """Return a single sprint's detail by id."""

    spec = ToolSpec(
        name="get_sprint_detail",
        description="Return a sprint's detail: id, name, goal, status, and dates.",
        parameters={
            "type": "object",
            "properties": {
                "sprint_id": {"type": "string", "description": "Sprint UUID"}
            },
            "required": ["sprint_id"],
        },
        category="sprint",
        capability="sprint.detail",
    )

    def __init__(self, sprints_service: SprintsService | None = None) -> None:
        self._sprints = sprints_service or SprintsService()

    async def run(self, args: dict[str, Any], ctx: ToolContext) -> ToolResult:
        try:
            sprint_id = _require_uuid(args, "sprint_id")
        except _InvalidArgs:
            return _invalid_args()
        sprint = self._sprints.get_sprint(ctx.session, sprint_id, ctx.user)
        return ToolResult(ok=True, content=_sprint_dict(sprint), source="sprint")


class SprintMetricsTool(Tool):
    """Return commitment + work-type metrics for a sprint."""

    spec = ToolSpec(
        name="get_sprint_metrics",
        description=(
            "Return sprint metrics: commitment (total vs completed story "
            "points) and a work-type breakdown."
        ),
        parameters={
            "type": "object",
            "properties": {
                "project_id": {"type": "string", "description": "Project UUID"},
                "sprint_id": {"type": "string", "description": "Sprint UUID"},
            },
            "required": ["project_id", "sprint_id"],
        },
        category="sprint",
        capability="sprint.metrics",
    )

    def __init__(self, sprints_service: SprintsService | None = None) -> None:
        self._sprints = sprints_service or SprintsService()

    async def run(self, args: dict[str, Any], ctx: ToolContext) -> ToolResult:
        try:
            project_id: UUID = _require_uuid(args, "project_id")
            sprint_id: UUID = _require_uuid(args, "sprint_id")
        except _InvalidArgs:
            return _invalid_args()
        # Already-trimmed dict of primitives — safe to return as-is.
        insights = self._sprints.get_sprint_insights(
            ctx.session, project_id, sprint_id, ctx.user
        )
        return ToolResult(ok=True, content=insights, source="sprint")
