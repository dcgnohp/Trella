"""Sprint write tools (P8): propose + apply wrappers over ``SprintsService``.

``run`` validates + previews only; ``apply`` calls the frozen business method
and lets its ``HTTPException`` (e.g. "a sprint is already active") propagate.

ponytail: thin adapters -- no lifecycle rules here; ``SprintsService`` owns
RBAC, the single-active-sprint invariant, and open-task handling on complete.
"""

from __future__ import annotations

from typing import Any

from app.ai.tools.base import ToolContext, ToolResult, ToolSpec, WriteTool
from app.ai.tools.data_access import (
    _invalid_args,
    _InvalidArgs,
    _require_uuid,
)
from app.schemas.sprints_schema import SprintComplete, SprintCreate, SprintStart
from app.services.sprints_service import SprintsService


def _optional(args: dict[str, Any], *keys: str) -> dict[str, Any]:
    """Collect present, non-null values for ``keys`` (pydantic coerces dates)."""
    return {
        k: args[k] for k in keys if isinstance(args, dict) and args.get(k) is not None
    }


def _sprint_summary(sprint: Any, message: str) -> dict[str, Any]:
    """Tiny, non-sensitive summary of a written sprint plus a human ``message``."""
    return {
        "id": str(sprint.id),
        "name": sprint.name,
        "status": sprint.status,
        "message": message,
    }


class CreateSprintTool(WriteTool):
    """Create a sprint for a project via ``SprintsService.create_sprint``."""

    spec = ToolSpec(
        name="create_sprint",
        description="Create a sprint for a project with an optional name, goal, and start/end dates.",
        parameters={
            "type": "object",
            "properties": {
                "project_id": {"type": "string", "description": "Project UUID"},
                "name": {"type": "string"},
                "goal": {"type": "string"},
                "start_date": {"type": "string", "description": "ISO date"},
                "end_date": {"type": "string", "description": "ISO date"},
            },
            "required": ["project_id"],
        },
        category="sprint",
        capability="sprint.create",
        capabilities=frozenset({"write"}),
        mutating=True,
    )

    def __init__(self, sprints_service: SprintsService | None = None) -> None:
        self._sprints = sprints_service or SprintsService()

    async def run(self, args: dict[str, Any], ctx: ToolContext) -> ToolResult:
        try:
            project_id = _require_uuid(args, "project_id")
        except _InvalidArgs:
            return _invalid_args()
        fields = _optional(args, "name", "goal", "start_date", "end_date")
        normalized = {"project_id": str(project_id), **fields}
        label = fields.get("name") or "(auto-named)"
        return ToolResult(
            ok=True,
            content={"preview": f"Create sprint {label}", "args": normalized},
            source="sprint",
        )

    async def apply(self, args: dict[str, Any], ctx: ToolContext) -> ToolResult:
        project_id = _require_uuid(args, "project_id")
        data = SprintCreate.model_validate(
            _optional(args, "name", "goal", "start_date", "end_date")
        )
        sprint = self._sprints.create_sprint(ctx.session, project_id, data, ctx.user)
        message = f"Created sprint '{sprint.name}'."
        return ToolResult(
            ok=True, content=_sprint_summary(sprint, message), source="sprint"
        )


class StartSprintTool(WriteTool):
    """Activate a sprint via ``SprintsService.start_sprint``."""

    spec = ToolSpec(
        name="start_sprint",
        description="Start (activate) a sprint, setting its start and end dates.",
        parameters={
            "type": "object",
            "properties": {
                "sprint_id": {"type": "string", "description": "Sprint UUID"},
                "start_date": {"type": "string", "description": "ISO date"},
                "end_date": {"type": "string", "description": "ISO date"},
                "name": {"type": "string"},
                "goal": {"type": "string"},
            },
            "required": ["sprint_id", "start_date", "end_date"],
        },
        category="sprint",
        capability="sprint.start",
        capabilities=frozenset({"write"}),
        mutating=True,
    )

    def __init__(self, sprints_service: SprintsService | None = None) -> None:
        self._sprints = sprints_service or SprintsService()

    async def run(self, args: dict[str, Any], ctx: ToolContext) -> ToolResult:
        try:
            sprint_id = _require_uuid(args, "sprint_id")
        except _InvalidArgs:
            return _invalid_args()
        if args.get("start_date") is None or args.get("end_date") is None:
            return _invalid_args()
        fields = _optional(args, "start_date", "end_date", "name", "goal")
        normalized = {"sprint_id": str(sprint_id), **fields}
        return ToolResult(
            ok=True,
            content={"preview": f"Start sprint {sprint_id}", "args": normalized},
            source="sprint",
        )

    async def apply(self, args: dict[str, Any], ctx: ToolContext) -> ToolResult:
        sprint_id = _require_uuid(args, "sprint_id")
        data = SprintStart.model_validate(
            _optional(args, "start_date", "end_date", "name", "goal")
        )
        sprint = self._sprints.start_sprint(ctx.session, sprint_id, data, ctx.user)
        message = f"Started sprint '{sprint.name}'."
        return ToolResult(
            ok=True, content=_sprint_summary(sprint, message), source="sprint"
        )


class CompleteSprintTool(WriteTool):
    """Complete a sprint via ``SprintsService.complete_sprint``."""

    spec = ToolSpec(
        name="close_sprint",
        description="Complete a sprint, moving still-open tasks to the backlog or another sprint.",
        parameters={
            "type": "object",
            "properties": {
                "sprint_id": {"type": "string", "description": "Sprint UUID"},
                "move_open_to": {
                    "type": "string",
                    "description": "'backlog' (default) or a target sprint UUID",
                },
            },
            "required": ["sprint_id"],
        },
        category="sprint",
        capability="sprint.close",
        capabilities=frozenset({"write"}),
        mutating=True,
    )

    def __init__(self, sprints_service: SprintsService | None = None) -> None:
        self._sprints = sprints_service or SprintsService()

    async def run(self, args: dict[str, Any], ctx: ToolContext) -> ToolResult:
        try:
            sprint_id = _require_uuid(args, "sprint_id")
        except _InvalidArgs:
            return _invalid_args()
        move_open_to = args.get("move_open_to") or "backlog"
        normalized = {"sprint_id": str(sprint_id), "move_open_to": move_open_to}
        return ToolResult(
            ok=True,
            content={
                "preview": f"Complete sprint {sprint_id} (open tasks -> {move_open_to})",
                "args": normalized,
            },
            source="sprint",
        )

    async def apply(self, args: dict[str, Any], ctx: ToolContext) -> ToolResult:
        sprint_id = _require_uuid(args, "sprint_id")
        data = SprintComplete.model_validate(
            {"move_open_to": args.get("move_open_to") or "backlog"}
        )
        sprint = self._sprints.complete_sprint(ctx.session, sprint_id, data, ctx.user)
        message = f"Completed sprint '{sprint.name}'."
        return ToolResult(
            ok=True, content=_sprint_summary(sprint, message), source="sprint"
        )
