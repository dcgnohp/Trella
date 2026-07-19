"""Data-access tools (P7-B4): a sanctioned boundary in ``app.ai`` allowed to
import business modules (``app.services.*`` / ``app.repositories.*`` /
``app.models.*``). The only other such place is the Phase 9 retrieval layer
(``app.ai.retrieval``), which touches ONLY the document data layer (the ``Doc``
model + the AI-owned ``doc_embeddings`` repository) — never business services.
The Reasoning Engine, Platform, and Provider layers stay business-agnostic.

Every tool here is read-only, deterministic, and independently testable. Tools
expose *trimmed*, JSON-safe, non-sensitive projections of business data — they
never call AI, never invoke other tools, never run workflows, and never mutate.

Shared, dependency-free helpers live at the top of this module so the six tool
files can import them without a circular import (helpers are defined before the
submodule imports below, so a submodule doing
``from app.ai.tools.data_access import _require_uuid`` sees them ready).
"""

from __future__ import annotations

from datetime import date, datetime
from typing import TYPE_CHECKING, Any
from uuid import UUID

if TYPE_CHECKING:
    from app.ai.tools.base import ToolResult

# ponytail: fixed output caps keep tool results small enough to hand to a model
# without blowing the context budget. Ceiling: very large projects are silently
# truncated. Upgrade path = cursor/paged tool args when a caller needs more.
MAX_ITEMS = 50
MAX_TEXT = 2000


class _InvalidArgs(Exception):
    """Raised by the arg helpers; each ``run`` maps it to ``error="invalid_args"``."""


def _invalid_args() -> ToolResult:
    from app.ai.tools.base import ToolResult

    return ToolResult(ok=False, error="invalid_args")


def _require_uuid(args: dict[str, Any], key: str) -> UUID:
    """Return ``args[key]`` as a UUID or raise :class:`_InvalidArgs`."""
    raw = args.get(key) if isinstance(args, dict) else None
    if raw is None:
        raise _InvalidArgs(key)
    if isinstance(raw, UUID):
        return raw
    try:
        return UUID(str(raw))
    except (ValueError, AttributeError, TypeError) as err:
        raise _InvalidArgs(key) from err


def _require_str(args: dict[str, Any], key: str) -> str:
    """Return a non-empty string ``args[key]`` or raise :class:`_InvalidArgs`."""
    raw = args.get(key) if isinstance(args, dict) else None
    if not isinstance(raw, str) or not raw.strip():
        raise _InvalidArgs(key)
    return raw


def _truncate(text: str | None, limit: int = MAX_TEXT) -> str | None:
    """Trim long free-text bodies to ``limit`` chars (None passes through)."""
    if text is None:
        return None
    return text if len(text) <= limit else text[:limit]


def _iso(value: datetime | date | None) -> str | None:
    """ISO-format a date/datetime, or None."""
    return value.isoformat() if value is not None else None


# --- Tool exports (imported AFTER the helpers above to avoid a cycle) --------

from app.ai.tools.base import Tool  # noqa: E402
from app.ai.tools.data_access.board_tools import BoardListTool  # noqa: E402
from app.ai.tools.data_access.knowledge_tools import (  # noqa: E402
    DocumentDetailTool,
    DocumentLookupTool,
    DocumentSearchTool,
)
from app.ai.tools.data_access.project_tools import (  # noqa: E402
    ProjectHealthTool,
    ProjectSummaryTool,
)
from app.ai.tools.data_access.sprint_tools import (  # noqa: E402
    CurrentSprintTool,
    SprintDetailTool,
    SprintMetricsTool,
)
from app.ai.tools.data_access.task_tools import (  # noqa: E402
    BlockedTasksTool,
    TaskDetailTool,
    TaskLookupTool,
    TaskSearchTool,
)
from app.ai.tools.data_access.user_tools import UserLookupTool  # noqa: E402
from app.ai.tools.data_access.workspace_tools import (  # noqa: E402
    ListWorkspacesTool,
    ProjectListTool,
    WorkspaceStatsTool,
    WorkspaceSummaryTool,
)


def all_data_access_tools() -> list[Tool]:
    """Fresh instances of every data-access tool (for registry wiring in B9)."""
    return [
        ListWorkspacesTool(),
        WorkspaceSummaryTool(),
        WorkspaceStatsTool(),
        ProjectListTool(),
        ProjectSummaryTool(),
        ProjectHealthTool(),
        BoardListTool(),
        CurrentSprintTool(),
        SprintDetailTool(),
        SprintMetricsTool(),
        TaskDetailTool(),
        TaskLookupTool(),
        TaskSearchTool(),
        BlockedTasksTool(),
        DocumentLookupTool(),
        DocumentSearchTool(),
        DocumentDetailTool(),
        UserLookupTool(),
    ]


__all__ = [
    "all_data_access_tools",
    "ListWorkspacesTool",
    "WorkspaceSummaryTool",
    "WorkspaceStatsTool",
    "ProjectListTool",
    "ProjectSummaryTool",
    "BoardListTool",
    "ProjectHealthTool",
    "CurrentSprintTool",
    "SprintDetailTool",
    "SprintMetricsTool",
    "TaskDetailTool",
    "TaskLookupTool",
    "TaskSearchTool",
    "BlockedTasksTool",
    "DocumentLookupTool",
    "DocumentSearchTool",
    "DocumentDetailTool",
    "UserLookupTool",
]
