"""Write-tool aggregator (P8).

Re-exports the nine ``WriteTool`` subclasses and exposes ``all_write_tools()``
returning fresh instances. Registry wiring happens elsewhere -- this module
does NOT touch the global registry.
"""

from __future__ import annotations

from app.ai.tools.base import Tool
from app.ai.tools.data_access.doc_write_tools import CreateDocTool, UpdateDocTool
from app.ai.tools.data_access.sprint_write_tools import (
    CompleteSprintTool,
    CreateSprintTool,
    StartSprintTool,
)
from app.ai.tools.data_access.task_write_tools import (
    AssignTaskTool,
    CreateTaskTool,
    MoveTaskTool,
    UpdateTaskTool,
)


def all_write_tools() -> list[Tool]:
    """Fresh instances of every write tool (for registry wiring elsewhere)."""
    return [
        CreateTaskTool(),
        UpdateTaskTool(),
        AssignTaskTool(),
        MoveTaskTool(),
        CreateSprintTool(),
        StartSprintTool(),
        CompleteSprintTool(),
        CreateDocTool(),
        UpdateDocTool(),
    ]


__all__ = [
    "all_write_tools",
    "CreateTaskTool",
    "UpdateTaskTool",
    "AssignTaskTool",
    "MoveTaskTool",
    "CreateSprintTool",
    "StartSprintTool",
    "CompleteSprintTool",
    "CreateDocTool",
    "UpdateDocTool",
]
