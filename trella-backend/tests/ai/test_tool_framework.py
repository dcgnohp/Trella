"""Tests for the tool framework + registry (P7-B1).

Exercise the registry surface (register/get/has/list/find) with a fake tool.
No DB is needed: the registry only touches ``ToolSpec`` metadata, so we never
construct a ``ToolContext`` here.
"""

from __future__ import annotations

import asyncio
from typing import Any

import pytest

from app.ai.tools import (
    Tool,
    ToolContext,
    ToolRegistry,
    ToolResult,
    ToolSpec,
    get_tool_registry,
)


class _FakeTool(Tool):
    """Minimal read-only tool for registry tests."""

    def __init__(self, *, name: str, category: str, capability: str) -> None:
        self.spec = ToolSpec(
            name=name,
            description=f"fake {name}",
            parameters={
                "type": "object",
                "properties": {"id": {"type": "string"}},
                "required": ["id"],
            },
            category=category,
            capability=capability,
        )

    async def run(self, args: dict[str, Any], ctx: ToolContext) -> ToolResult:
        return ToolResult(
            ok=True, content={"id": args.get("id")}, source=self.spec.name
        )


def _tool(
    name: str = "task_lookup", category: str = "task", capability: str = "task.lookup"
) -> _FakeTool:
    return _FakeTool(name=name, category=category, capability=capability)


def test_register_get_has() -> None:
    registry = ToolRegistry()
    tool = _tool()
    registry.register(tool)
    assert registry.has("task_lookup")
    assert registry.get("task_lookup") is tool


def test_get_unknown_returns_none() -> None:
    registry = ToolRegistry()
    assert registry.get("missing") is None
    assert registry.has("missing") is False


def test_duplicate_register_raises() -> None:
    registry = ToolRegistry()
    registry.register(_tool())
    with pytest.raises(ValueError, match="already registered"):
        registry.register(_tool())


def test_list_tools_filters_by_category() -> None:
    registry = ToolRegistry()
    task_tool = _tool(name="task_lookup", category="task", capability="task.lookup")
    project_tool = _tool(
        name="project_lookup", category="project", capability="project.lookup"
    )
    registry.register(task_tool)
    registry.register(project_tool)

    assert set(registry.list_tools()) == {task_tool, project_tool}
    assert registry.list_tools(category="task") == [task_tool]
    assert registry.list_tools(category="nope") == []


def test_list_specs_returns_json_schema_dicts() -> None:
    registry = ToolRegistry()
    registry.register(_tool())
    specs = registry.list_specs()
    assert len(specs) == 1
    spec = specs[0]
    assert isinstance(spec, ToolSpec)
    assert isinstance(spec.parameters, dict)
    assert spec.parameters["type"] == "object"
    assert "id" in spec.parameters["properties"]
    # category filter is honored on specs too.
    assert registry.list_specs(category="task") == [spec]
    assert registry.list_specs(category="other") == []


def test_find_by_capability() -> None:
    registry = ToolRegistry()
    tool = _tool(capability="task.lookup")
    registry.register(tool)
    assert registry.find_by_capability("task.lookup") is tool
    assert registry.find_by_capability("unknown.cap") is None


def test_default_registry_accessor_is_singleton() -> None:
    assert get_tool_registry() is get_tool_registry()
    assert isinstance(get_tool_registry(), ToolRegistry)


def test_fake_tool_run_is_read_only_summary() -> None:
    # Sanity check the Tool contract without a DB/context dependency.
    # ``asyncio.run`` matches the rest of the AI suite (no pytest-asyncio).
    result = asyncio.run(_tool().run({"id": "abc"}, ctx=None))  # type: ignore[arg-type]
    assert result.ok is True
    assert result.content == {"id": "abc"}
    assert result.source == "task_lookup"
