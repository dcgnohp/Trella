"""Task write tools (P8): propose + apply wrappers over ``TasksService``.

Each tool's ``run`` is PROPOSE-only (validate args + build a human ``preview``,
NO mutation); ``apply`` performs the write by calling the *existing* business
service and lets its ``HTTPException`` propagate to the Execution Engine.

ponytail: these are thin adapters -- no business logic lives here. All RBAC,
membership, and side effects stay in ``TasksService``; we only shape args into
the frozen DTOs and summarize the result.
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from markdown_it import MarkdownIt

from app.ai.tools.base import ToolContext, ToolResult, ToolSpec, WriteTool
from app.ai.tools.data_access import (
    _invalid_args,
    _InvalidArgs,
    _require_str,
    _require_uuid,
)
from app.models.sprints_model import Sprint
from app.repositories.board_columns_repository import BoardColumnsRepository
from app.schemas.tasks_schema import TaskCreate, TaskUpdate
from app.services.tasks_service import TasksService

# The task description field round-trips HTML (the TipTap editor stores
# ``editor.getHTML()``); the LLM authors the description in Markdown. Convert
# once at persist time so the saved value renders as formatted rich text instead
# of raw "## ..." / "- ..." source. ponytail: reuses the already-installed
# markdown-it-py (CommonMark); no new capability beyond headings/lists/bold/etc.
_MD = MarkdownIt()


def _description_to_html(value: Any) -> Any:
    """Render a Markdown description string to HTML; pass non-strings through."""
    if isinstance(value, str) and value.strip():
        return _MD.render(value).strip()
    return value


def _optional(args: dict[str, Any], *keys: str) -> dict[str, Any]:
    """Collect the present, non-null values for ``keys`` (pydantic coerces them)."""
    return {
        k: args[k] for k in keys if isinstance(args, dict) and args.get(k) is not None
    }


def _task_summary(task: Any, message: str) -> dict[str, Any]:
    """Tiny, non-sensitive summary of a written task plus a human ``message``.

    ``message`` is what the UI shows the user after execution (the execute step
    is model-less), so every write tool supplies a readable sentence.
    """
    return {"id": str(task.id), "issue_key": task.issue_key, "message": message}


class CreateTaskTool(WriteTool):
    """Create a task in a board column via ``TasksService.create_task``."""

    _OPTIONAL_FIELDS = ("description", "type", "story_point", "assignee_id", "due_date")

    spec = ToolSpec(
        name="create_task",
        description=(
            "Create a task on a board. Only board_id + title are required; if "
            "column_id is omitted the task lands in the board's first column. You "
            "may also set description, type, story points, assignee, and due date."
        ),
        parameters={
            "type": "object",
            "properties": {
                "board_id": {"type": "string", "description": "Board UUID"},
                "column_id": {
                    "type": "string",
                    "description": "Optional column UUID; defaults to the first column",
                },
                "title": {"type": "string", "description": "Task title"},
                "description": {"type": "string", "description": "Task description"},
                "type": {"type": "string"},
                "story_point": {"type": "integer"},
                "assignee_id": {"type": "string"},
                "due_date": {"type": "string", "description": "ISO datetime"},
            },
            "required": ["board_id", "title"],
        },
        category="task",
        capability="task.create",
        capabilities=frozenset({"write"}),
        mutating=True,
    )

    def __init__(
        self,
        tasks_service: TasksService | None = None,
        columns_repo: BoardColumnsRepository | None = None,
    ) -> None:
        self._tasks = tasks_service or TasksService()
        self._columns = columns_repo or BoardColumnsRepository()

    async def run(self, args: dict[str, Any], ctx: ToolContext) -> ToolResult:
        try:
            board_id = _require_uuid(args, "board_id")
            title = _require_str(args, "title")
            # column_id is optional (defaults to the board's first column); when
            # given it must be a valid UUID.
            column_id = (
                _require_uuid(args, "column_id")
                if args.get("column_id") is not None
                else None
            )
        except _InvalidArgs:
            return _invalid_args()
        normalized: dict[str, Any] = {
            "board_id": str(board_id),
            "title": title,
            **_optional(args, *self._OPTIONAL_FIELDS),
        }
        if column_id is not None:
            normalized["column_id"] = str(column_id)
        return ToolResult(
            ok=True,
            content={"preview": f"Create task '{title}'", "args": normalized},
            source="task",
        )

    def _resolve_column(
        self, session: Any, board_id: UUID, args: dict[str, Any]
    ) -> Any:
        """Pick the target column: explicit column_id > "To Do" > leftmost.

        ponytail: no read tool exposes columns, so "create a task in board X"
        must not require a column UUID. Prefers the canonical To Do column
        (``status_key`` == "TODO") so new AI tasks land in To Do, else the
        leftmost column (``list_by_board`` is position-ordered). Returns None if
        the board has no columns, which surfaces as a clean tool error.
        """
        columns = self._columns.list_by_board(session, board_id)
        if not columns:
            return None
        if args.get("column_id") is not None:
            column_id = _require_uuid(args, "column_id")
            return next((c for c in columns if c.id == column_id), None)
        todo = next(
            (
                c
                for c in columns
                if (getattr(c, "status_key", "") or "").upper() == "TODO"
            ),
            None,
        )
        return todo or columns[0]

    def _placement_message(
        self, session: Any, task: Any, column: Any
    ) -> dict[str, Any]:
        """Human-readable placement so the UI can tell the user where the task went."""
        sprint = (
            session.get(Sprint, task.sprint_id) if task.sprint_id is not None else None
        )
        location = f"sprint '{sprint.name}'" if sprint is not None else "the backlog"
        status_label = getattr(column, "name", "To Do")
        message = (
            f"Created {task.issue_key} '{task.title}' — status {status_label}, "
            f"in {location}."
        )
        return {
            **_task_summary(task, message),
            "title": task.title,
            "status": status_label,
            "sprint": sprint.name if sprint is not None else None,
            "location": location,
        }

    async def apply(self, args: dict[str, Any], ctx: ToolContext) -> ToolResult:
        board_id = _require_uuid(args, "board_id")
        column = self._resolve_column(ctx.session, board_id, args)
        if column is None:
            return ToolResult(ok=False, error="no_board_column", source="task")
        optional = _optional(args, *self._OPTIONAL_FIELDS)
        if "description" in optional:
            optional["description"] = _description_to_html(optional["description"])
        data = TaskCreate.model_validate(
            {"title": _require_str(args, "title"), **optional}
        )
        task = self._tasks.create_task(ctx.session, board_id, column.id, data, ctx.user)
        return ToolResult(
            ok=True,
            content=self._placement_message(ctx.session, task, column),
            source="task",
        )


class UpdateTaskTool(WriteTool):
    """Patch task fields via ``TasksService.update_task``."""

    _FIELDS = ("title", "description", "priority", "story_point", "due_date")

    spec = ToolSpec(
        name="update_task",
        description="Update a task's title, description, priority, story points, or due date.",
        parameters={
            "type": "object",
            "properties": {
                "task_id": {"type": "string", "description": "Task UUID"},
                "title": {"type": "string"},
                "description": {"type": "string"},
                "priority": {"type": "string"},
                "story_point": {"type": "integer"},
                "due_date": {"type": "string", "description": "ISO datetime"},
            },
            "required": ["task_id"],
        },
        category="task",
        capability="task.update",
        capabilities=frozenset({"write"}),
        mutating=True,
    )

    def __init__(self, tasks_service: TasksService | None = None) -> None:
        self._tasks = tasks_service or TasksService()

    async def run(self, args: dict[str, Any], ctx: ToolContext) -> ToolResult:
        try:
            task_id = _require_uuid(args, "task_id")
        except _InvalidArgs:
            return _invalid_args()
        fields = _optional(args, *self._FIELDS)
        if not fields:  # require task_id + at least one field to change
            return _invalid_args()
        changed = ", ".join(sorted(fields))
        normalized = {"task_id": str(task_id), **fields}
        return ToolResult(
            ok=True,
            content={
                "preview": f"Update task {task_id}: {changed}",
                "args": normalized,
            },
            source="task",
        )

    async def apply(self, args: dict[str, Any], ctx: ToolContext) -> ToolResult:
        task_id = _require_uuid(args, "task_id")
        fields = _optional(args, *self._FIELDS)
        if "description" in fields:
            fields["description"] = _description_to_html(fields["description"])
        data = TaskUpdate.model_validate(fields)
        task = self._tasks.update_task(ctx.session, task_id, data, ctx.user)
        changed = ", ".join(sorted(fields))
        message = f"Updated {task.issue_key} '{task.title}' ({changed})."
        return ToolResult(ok=True, content=_task_summary(task, message), source="task")


class AssignTaskTool(WriteTool):
    """Set or clear a task's assignee via ``set_assignee`` / ``unset_assignee``."""

    spec = ToolSpec(
        name="assign_task",
        description="Assign a task to a user, or unassign it when assignee_id is omitted/null.",
        parameters={
            "type": "object",
            "properties": {
                "task_id": {"type": "string", "description": "Task UUID"},
                "assignee_id": {
                    "type": "string",
                    "description": "Assignee UUID, or null to unassign",
                },
            },
            "required": ["task_id"],
        },
        category="task",
        capability="task.assign",
        capabilities=frozenset({"write"}),
        mutating=True,
    )

    def __init__(self, tasks_service: TasksService | None = None) -> None:
        self._tasks = tasks_service or TasksService()

    async def run(self, args: dict[str, Any], ctx: ToolContext) -> ToolResult:
        try:
            task_id = _require_uuid(args, "task_id")
            assignee_id = (
                _require_uuid(args, "assignee_id")
                if args.get("assignee_id") is not None
                else None
            )
        except _InvalidArgs:
            return _invalid_args()
        preview = (
            f"Assign task {task_id} to {assignee_id}"
            if assignee_id is not None
            else f"Unassign task {task_id}"
        )
        normalized = {
            "task_id": str(task_id),
            "assignee_id": str(assignee_id) if assignee_id is not None else None,
        }
        return ToolResult(
            ok=True, content={"preview": preview, "args": normalized}, source="task"
        )

    async def apply(self, args: dict[str, Any], ctx: ToolContext) -> ToolResult:
        task_id = _require_uuid(args, "task_id")
        if args.get("assignee_id") is not None:
            assignee_id = _require_uuid(args, "assignee_id")
            task = self._tasks.set_assignee(ctx.session, task_id, assignee_id, ctx.user)
            message = f"Assigned {task.issue_key} '{task.title}'."
        else:
            task = self._tasks.unset_assignee(ctx.session, task_id, ctx.user)
            message = f"Unassigned {task.issue_key} '{task.title}'."
        return ToolResult(ok=True, content=_task_summary(task, message), source="task")


class MoveTaskTool(WriteTool):
    """Move a task between sprint / status / column via ``update_task``."""

    _TARGETS = ("sprint_id", "custom_status_id", "column_id")

    spec = ToolSpec(
        name="move_task",
        description="Move a task to a different sprint, custom status, or board column.",
        parameters={
            "type": "object",
            "properties": {
                "task_id": {"type": "string", "description": "Task UUID"},
                "sprint_id": {"type": "string"},
                "custom_status_id": {"type": "string"},
                "column_id": {"type": "string"},
            },
            "required": ["task_id"],
        },
        category="task",
        capability="task.move",
        capabilities=frozenset({"write"}),
        mutating=True,
    )

    def __init__(self, tasks_service: TasksService | None = None) -> None:
        self._tasks = tasks_service or TasksService()

    def _targets(self, args: dict[str, Any]) -> dict[str, Any]:
        """Validate the present target ids as UUIDs (raises :class:`_InvalidArgs`)."""
        return {
            key: _require_uuid(args, key)
            for key in self._TARGETS
            if args.get(key) is not None
        }

    async def run(self, args: dict[str, Any], ctx: ToolContext) -> ToolResult:
        try:
            task_id = _require_uuid(args, "task_id")
            targets = self._targets(args)
        except _InvalidArgs:
            return _invalid_args()
        if not targets:  # need at least one move target
            return _invalid_args()
        normalized = {
            "task_id": str(task_id),
            **{k: str(v) for k, v in targets.items()},
        }
        return ToolResult(
            ok=True,
            content={"preview": f"Move task {task_id}", "args": normalized},
            source="task",
        )

    async def apply(self, args: dict[str, Any], ctx: ToolContext) -> ToolResult:
        task_id = _require_uuid(args, "task_id")
        data = TaskUpdate.model_validate(self._targets(args))
        task = self._tasks.update_task(ctx.session, task_id, data, ctx.user)
        message = f"Moved {task.issue_key} '{task.title}'."
        return ToolResult(ok=True, content=_task_summary(task, message), source="task")
