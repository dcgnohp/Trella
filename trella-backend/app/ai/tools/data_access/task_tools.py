"""Task-scoped data-access tools."""

from __future__ import annotations

from typing import Any
from uuid import UUID

from app.ai.tools.base import Tool, ToolContext, ToolResult, ToolSpec
from app.ai.tools.data_access import (
    MAX_ITEMS,
    _invalid_args,
    _InvalidArgs,
    _iso,
    _require_str,
    _require_uuid,
    _truncate,
)
from app.ai.tools.permissions import PermissionLayer
from app.models.enums import CanonicalStatus
from app.models.tasks_model import Task
from app.repositories.custom_statuses_repository import CustomStatusesRepository
from app.repositories.projects_repository import ProjectsRepository
from app.services.sprints_service import SprintsService
from app.services.tasks_service import TasksService


def _task_dict(task: Task) -> dict[str, Any]:
    """A trimmed, JSON-safe projection of a Task (no canonical status here)."""
    return {
        "id": str(task.id),
        "project_id": str(task.project_id),
        "title": task.title,
        "description": _truncate(task.description),
        "priority": task.priority,
        "type": task.type,
        "story_point": task.story_point,
        "assignee_id": str(task.assignee_id) if task.assignee_id else None,
        "sprint_id": str(task.sprint_id) if task.sprint_id else None,
        "custom_status_id": (
            str(task.custom_status_id) if task.custom_status_id else None
        ),
        "issue_key": task.issue_key,
        "due_date": _iso(task.due_date),
    }


def _task_brief(task: Task) -> dict[str, Any]:
    """An even leaner projection for list results."""
    return {
        "id": str(task.id),
        "title": task.title,
        "issue_key": task.issue_key,
        "priority": task.priority,
    }


def _gather_project_tasks(
    tasks_service: TasksService,
    sprints_service: SprintsService,
    session: Any,
    project_id: UUID,
    user: Any,
) -> list[Task]:
    """All tasks the caller can see in a project: sprint tasks + backlog, de-duped.

    ponytail: union of ``list_sprints_with_tasks`` + ``list_backlog`` (both
    permission-enforced). Ceiling: excludes tasks on boards with no sprint in a
    Kanban workspace beyond what those endpoints return. Upgrade path = a
    dedicated indexed task listing across all board columns.
    """
    seen: dict[UUID, Task] = {}
    for row in sprints_service.list_sprints_with_tasks(session, project_id, user):
        for task in row["tasks"]:
            seen[task.id] = task
    for task in tasks_service.list_backlog(session, project_id, user):
        seen[task.id] = task
    return list(seen.values())


class TaskDetailTool(Tool):
    """Return a single task's detail by id."""

    spec = ToolSpec(
        name="get_task_detail",
        description=(
            "Return a task's detail by id: title, description, priority, type, "
            "story points, assignee, sprint, status id, and issue key."
        ),
        parameters={
            "type": "object",
            "properties": {"task_id": {"type": "string", "description": "Task UUID"}},
            "required": ["task_id"],
        },
        category="task",
        capability="task.detail",
    )

    def __init__(self, tasks_service: TasksService | None = None) -> None:
        self._tasks = tasks_service or TasksService()

    async def run(self, args: dict[str, Any], ctx: ToolContext) -> ToolResult:
        try:
            task_id = _require_uuid(args, "task_id")
        except _InvalidArgs:
            return _invalid_args()
        task = self._tasks.get_task(ctx.session, task_id, ctx.user)
        return ToolResult(ok=True, content=_task_dict(task), source="task")


class TaskLookupTool(Tool):
    """Look up a task by its human issue key within a project."""

    spec = ToolSpec(
        name="lookup_task",
        description=(
            "Look up a task by its issue key (e.g. 'PROJ-12') within a project. "
            "Returns null when no backlog task matches."
        ),
        parameters={
            "type": "object",
            "properties": {
                "project_id": {"type": "string", "description": "Project UUID"},
                "issue_key": {
                    "type": "string",
                    "description": "Issue key, e.g. PROJ-1",
                },
            },
            "required": ["project_id", "issue_key"],
        },
        category="task",
        capability="task.lookup",
    )

    def __init__(
        self,
        tasks_service: TasksService | None = None,
        sprints_service: SprintsService | None = None,
        permissions: PermissionLayer | None = None,
    ) -> None:
        self._tasks = tasks_service or TasksService()
        self._sprints = sprints_service or SprintsService()
        self._perms = permissions or PermissionLayer()

    async def run(self, args: dict[str, Any], ctx: ToolContext) -> ToolResult:
        try:
            project_id = _require_uuid(args, "project_id")
            issue_key = _require_str(args, "issue_key")
        except _InvalidArgs:
            return _invalid_args()
        self._perms.check_project(ctx.session, ctx.user, project_id)
        needle = issue_key.strip().lower()
        for task in _gather_project_tasks(
            self._tasks, self._sprints, ctx.session, project_id, ctx.user
        ):
            if task.issue_key and task.issue_key.lower() == needle:
                return ToolResult(ok=True, content=_task_dict(task), source="task")
        return ToolResult(ok=True, content=None, source="task")


class TaskSearchTool(Tool):
    """Case-insensitive substring search over a project's backlog."""

    spec = ToolSpec(
        name="search_tasks",
        description=(
            "Search a project's tasks (sprint tasks + backlog) by a "
            "case-insensitive substring over title and description. Returns a "
            "capped list of brief matches."
        ),
        parameters={
            "type": "object",
            "properties": {
                "project_id": {"type": "string", "description": "Project UUID"},
                "query": {"type": "string", "description": "Search text"},
            },
            "required": ["project_id", "query"],
        },
        category="task",
        capability="task.search",
    )

    def __init__(
        self,
        tasks_service: TasksService | None = None,
        sprints_service: SprintsService | None = None,
        permissions: PermissionLayer | None = None,
    ) -> None:
        self._tasks = tasks_service or TasksService()
        self._sprints = sprints_service or SprintsService()
        self._perms = permissions or PermissionLayer()

    async def run(self, args: dict[str, Any], ctx: ToolContext) -> ToolResult:
        try:
            project_id = _require_uuid(args, "project_id")
            query = _require_str(args, "query")
        except _InvalidArgs:
            return _invalid_args()
        self._perms.check_project(ctx.session, ctx.user, project_id)
        needle = query.strip().lower()
        matches: list[dict[str, Any]] = []
        for task in _gather_project_tasks(
            self._tasks, self._sprints, ctx.session, project_id, ctx.user
        ):
            haystack = f"{task.title or ''} {task.description or ''}".lower()
            if needle in haystack:
                matches.append(_task_brief(task))
                if len(matches) >= MAX_ITEMS:
                    break
        return ToolResult(ok=True, content=matches, source="task")


class BlockedTasksTool(Tool):
    """Return tasks whose canonical status is PENDING (treated as blocked)."""

    spec = ToolSpec(
        name="get_blocked_tasks",
        description=(
            "Return tasks in a project that are on-hold/blocked. A task counts "
            "as blocked when its status maps to the canonical PENDING status."
        ),
        parameters={
            "type": "object",
            "properties": {
                "project_id": {"type": "string", "description": "Project UUID"}
            },
            "required": ["project_id"],
        },
        category="task",
        capability="task.blocked",
    )

    def __init__(
        self,
        tasks_service: TasksService | None = None,
        sprints_service: SprintsService | None = None,
        projects_repo: ProjectsRepository | None = None,
        custom_statuses_repo: CustomStatusesRepository | None = None,
        permissions: PermissionLayer | None = None,
    ) -> None:
        self._tasks = tasks_service or TasksService()
        self._sprints = sprints_service or SprintsService()
        self._projects = projects_repo or ProjectsRepository()
        self._statuses = custom_statuses_repo or CustomStatusesRepository()
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

        # Resolve canonical status via the task's workspace custom statuses
        # (mirrors SprintsService.list_sprints_with_tasks).
        # ponytail: heuristic -- canonical PENDING == blocked; there is no
        # explicit blocked flag in the domain. Upgrade path = an explicit
        # blocked flag when the domain adds one.
        canonical_by_status: dict[UUID, str | None] = {
            cs.id: cs.canonical_status
            for cs in self._statuses.list_by_workspace(
                ctx.session, project.workspace_id
            )
        }

        blocked: list[dict[str, Any]] = []
        for task in _gather_project_tasks(
            self._tasks, self._sprints, ctx.session, project_id, ctx.user
        ):
            status_id = task.custom_status_id
            canonical = (
                canonical_by_status.get(status_id) if status_id is not None else None
            )
            if canonical == CanonicalStatus.PENDING.value:
                blocked.append(
                    {
                        "id": str(task.id),
                        "title": task.title,
                        "issue_key": task.issue_key,
                        "sprint_id": str(task.sprint_id) if task.sprint_id else None,
                    }
                )
                if len(blocked) >= MAX_ITEMS:
                    break
        return ToolResult(ok=True, content=blocked, source="task")
