"""Tool wiring (P7-B9): register the data-access tools + shared session memory.

Registration is the ONLY step needed to make a new tool available to the
Reasoning Engine (the Registry owns discovery). This module is the single place
that pulls the Workspace Data Access Layer into the process-wide registry, kept
idempotent so repeated calls (per-request service construction, test setup) are
safe.

``get_session_memory`` exposes a process-wide :class:`SessionMemory` so tool
results can be reused across the HTTP requests of one conversation (keyed by
``conversation_id``), not just within a single reasoning loop.
"""

from __future__ import annotations

from app.ai.reasoning.session_memory import SessionMemory
from app.ai.tools.data_access import all_data_access_tools
from app.ai.tools.data_access.semantic_tools import SemanticDocumentSearchTool
from app.ai.tools.data_access.write_tools import all_write_tools
from app.ai.tools.registry import ToolRegistry, get_tool_registry
from app.core.config import settings


def ensure_tools_registered(
    registry: ToolRegistry | None = None,
    *,
    include_write: bool | None = None,
    include_semantic: bool | None = None,
) -> ToolRegistry:
    """Register every data-access tool once; safe to call repeatedly.

    Read tools are always registered. WRITE tools (Phase 8) register only when
    ``AI_AGENT_WRITE_ENABLED``; the SEMANTIC search tool (Phase 9) registers
    only when ``AI_SEMANTIC_SEARCH_ENABLED`` (or the explicit overrides). Skips
    any already-registered name so a second call never raises the duplicate.
    """
    registry = registry or get_tool_registry()
    for tool in all_data_access_tools():
        if not registry.has(tool.spec.name):
            registry.register(tool)

    write_on = (
        settings.AI_AGENT_WRITE_ENABLED if include_write is None else include_write
    )
    if write_on:
        for wtool in all_write_tools():
            if not registry.has(wtool.spec.name):
                registry.register(wtool)

    semantic_on = (
        settings.AI_SEMANTIC_SEARCH_ENABLED
        if include_semantic is None
        else include_semantic
    )
    if semantic_on:
        semantic_tool = SemanticDocumentSearchTool()
        if not registry.has(semantic_tool.spec.name):
            registry.register(semantic_tool)
    return registry


# ponytail: a single process-wide memory with the default TTL. Ceiling: not
# shared across workers and reset on restart. Upgrade path = a Redis-backed
# SessionMemory behind the same get/put interface (see session_memory.py).
_default_session_memory = SessionMemory()


def get_session_memory() -> SessionMemory:
    """Accessor for the process-wide conversation tool-result memory."""
    return _default_session_memory
