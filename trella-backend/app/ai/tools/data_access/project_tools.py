"""Project-scoped data-access tools."""

from __future__ import annotations

from typing import Any

from app.ai.tools.base import Tool, ToolContext, ToolResult, ToolSpec
from app.ai.tools.data_access import (
    _invalid_args,
    _InvalidArgs,
    _require_uuid,
    _truncate,
)
from app.ai.tools.permissions import PermissionLayer
from app.repositories.projects_repository import ProjectsRepository
from app.services.sprints_service import SprintsService
from app.services.tasks_service import TasksService

_PROJECT_ID_ARGS: dict[str, Any] = {
    "type": "object",
    "properties": {"project_id": {"type": "string", "description": "Project UUID"}},
    "required": ["project_id"],
}


class ProjectSummaryTool(Tool):
    """Return a project's identity and description."""

    spec = ToolSpec(
        name="get_project_summary",
        description=(
            "Return a project's identity: id, name, key, and description. Does "
            "NOT return a task count — use get_project_health for how many tasks "
            "a project has."
        ),
        parameters=_PROJECT_ID_ARGS,
        category="project",
        capability="project.summary",
    )

    def __init__(
        self,
        projects_repo: ProjectsRepository | None = None,
        permissions: PermissionLayer | None = None,
    ) -> None:
        self._projects = projects_repo or ProjectsRepository()
        self._perms = permissions or PermissionLayer()

    async def run(self, args: dict[str, Any], ctx: ToolContext) -> ToolResult:
        try:
            project_id = _require_uuid(args, "project_id")
        except _InvalidArgs:
            return _invalid_args()
        self._perms.check_project(ctx.session, ctx.user, project_id)
        project = self._projects.get(ctx.session, project_id)
        if project is None:
            return ToolResult(ok=False, error="not_found")
        return ToolResult(
            ok=True,
            content={
                "id": str(project.id),
                "name": project.name,
                "key": project.key,
                "description": _truncate(project.description),
                # NOTE: intentionally NOT exposing project.task_counter — it is
                # the issue-key sequence counter, not a count of tasks, and the
                # model was mistaking it for a task total.
            },
            source="project",
        )


class ProjectHealthTool(Tool):
    """Return a naive project-health snapshot aggregated from sprints."""

    spec = ToolSpec(
        name="get_project_health",
        description=(
            "Return a project's task counts and health: total number of tasks "
            "(INCLUDING the backlog), how many are in sprints vs backlog, "
            "sprint count, and done / in_progress / todo counts within sprints. "
            "Use this to answer 'how many tasks' questions."
        ),
        parameters=_PROJECT_ID_ARGS,
        category="project",
        capability="project.health",
    )

    def __init__(
        self,
        sprints_service: SprintsService | None = None,
        tasks_service: TasksService | None = None,
        permissions: PermissionLayer | None = None,
    ) -> None:
        self._sprints = sprints_service or SprintsService()
        self._tasks = tasks_service or TasksService()
        self._perms = permissions or PermissionLayer()

    async def run(self, args: dict[str, Any], ctx: ToolContext) -> ToolResult:
        try:
            project_id = _require_uuid(args, "project_id")
        except _InvalidArgs:
            return _invalid_args()
        self._perms.check_project(ctx.session, ctx.user, project_id)
        rows = self._sprints.list_sprints_with_tasks(ctx.session, project_id, ctx.user)
        # ponytail: naive health = count aggregation only. Upgrade path =
        # velocity / risk scoring (burndown, overdue, blocked ratios).
        done = sum(r["done_count"] for r in rows)
        in_progress = sum(r["in_progress_count"] for r in rows)
        todo = sum(r["todo_count"] for r in rows)
        sprint_tasks = done + in_progress + todo
        # Backlog tasks (no sprint) are disjoint from sprint tasks, so the total
        # is a clean sum. Earlier this excluded the backlog and under-counted.
        backlog_tasks = len(self._tasks.list_backlog(ctx.session, project_id, ctx.user))
        return ToolResult(
            ok=True,
            content={
                "project_id": str(project_id),
                "sprint_count": len(rows),
                "total_tasks": sprint_tasks + backlog_tasks,
                "sprint_tasks": sprint_tasks,
                "backlog_tasks": backlog_tasks,
                "done": done,
                "in_progress": in_progress,
                "todo": todo,
            },
            source="project",
        )
