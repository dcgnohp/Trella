"""Tool registry (P7-B1): discovery, metadata, and capability lookup.

The Reasoning Engine never knows concrete tools -- it plans over ``ToolSpec``
metadata. The Executor resolves a planned tool name (or capability id) back to
a concrete ``Tool`` here. Registration keeps names unique so a plan can't
ambiguously bind to two implementations.
"""

from __future__ import annotations

from app.ai.tools.base import Tool, ToolSpec


class ToolRegistry:
    """In-memory tool index keyed by unique tool name.

    ponytail: a plain dict, per-process. Ceiling: not shared across workers and
    reset on restart -- which is correct, tools are registered at import time.
    """

    def __init__(self) -> None:
        self._tools: dict[str, Tool] = {}

    def register(self, tool: Tool) -> None:
        """Register ``tool``; raise ``ValueError`` on a duplicate name."""
        name = tool.spec.name
        if name in self._tools:
            raise ValueError(f"Tool already registered: {name!r}")
        self._tools[name] = tool

    def get(self, name: str) -> Tool | None:
        """Return the tool named ``name``, or ``None`` if unknown."""
        return self._tools.get(name)

    def has(self, name: str) -> bool:
        """Whether a tool named ``name`` is registered."""
        return name in self._tools

    def list_tools(self, *, category: str | None = None) -> list[Tool]:
        """All registered tools, optionally filtered by ``category``."""
        tools = self._tools.values()
        if category is None:
            return list(tools)
        return [t for t in tools if t.spec.category == category]

    def list_specs(self, *, category: str | None = None) -> list[ToolSpec]:
        """Specs of registered tools (for provider tool schemas)."""
        return [t.spec for t in self.list_tools(category=category)]

    def find_by_capability(self, capability: str) -> Tool | None:
        """First tool advertising ``capability``, or ``None`` if none do."""
        return next(
            (t for t in self._tools.values() if t.spec.capability == capability),
            None,
        )


# Module-level default registry shared across the AI platform (mirrors the
# telemetry ``get_metrics_collector`` accessor pattern from Phase 6).
_default_registry = ToolRegistry()


def get_tool_registry() -> ToolRegistry:
    """Accessor for the process-wide default tool registry."""
    return _default_registry
