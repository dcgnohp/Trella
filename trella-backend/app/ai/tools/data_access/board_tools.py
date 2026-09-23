"""Board-scoped data-access tools.

Closes the Phase 7 "Board Retrieval" requirement and the DoD question
"Which board has the highest workload?" — the workload of a board is the number
of tasks currently on it.
"""

from __future__ import annotations

from typing import Any

from app.ai.tools.base import Tool, ToolContext, ToolResult, ToolSpec
from app.ai.tools.data_access import MAX_ITEMS, _invalid_args
from app.repositories.tasks_repository import TasksRepository
from app.services.boards_service import BoardsService


class BoardListTool(Tool):
    """List the workspace's boards with each board's task count (workload)."""

    spec = ToolSpec(
        name="list_boards",
        description=(
            "List the boards in the current workspace, each with id, title, "
            "project_id and task_count (its current workload). Use this to "
            "answer questions like 'which board has the most tasks / highest "
            "workload'."
        ),
        parameters={"type": "object", "properties": {}},
        category="board",
        capability="board.list",
    )

    def __init__(
        self,
        boards_service: BoardsService | None = None,
        tasks_repo: TasksRepository | None = None,
    ) -> None:
        self._boards = boards_service or BoardsService()
        self._tasks = tasks_repo or TasksRepository()

    async def run(self, args: dict[str, Any], ctx: ToolContext) -> ToolResult:
        if ctx.workspace_id is None:
            return _invalid_args()
        # list_boards enforces workspace membership (raises -> executor maps it).
        boards = self._boards.list_boards(ctx.session, ctx.workspace_id, ctx.user)
        # ponytail: one task query per board to compute workload. Ceiling: O(n)
        # queries for many boards. Upgrade path = a single grouped COUNT query.
        result = [
            {
                "id": str(board.id),
                "title": board.title,
                "project_id": str(board.project_id),
                "task_count": len(self._tasks.list_by_board(ctx.session, board.id)),
            }
            for board in boards[:MAX_ITEMS]
        ]
        return ToolResult(ok=True, content=result, source="board")
