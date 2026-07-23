"""Wiring gate for the PM analytics tools (Phase 10.2).

The three PM tools must register ONLY when ``AI_PM_ENABLED`` is on (here forced
via the explicit ``include_pm`` override so the test does not depend on env).
Read tools always register; PM tools are dark by default.
"""

from __future__ import annotations

from app.ai.tools.registry import ToolRegistry
from app.ai.tools.wiring import ensure_tools_registered

_PM_NAMES = {"analyze_sprint", "analyze_workload", "analyze_risk"}


def test_pm_tools_absent_when_flag_off() -> None:
    registry = ensure_tools_registered(
        ToolRegistry(), include_write=False, include_semantic=False, include_pm=False
    )
    assert not any(registry.has(name) for name in _PM_NAMES)
    # read tools still present (a representative one)
    assert registry.has("get_project_health")


def test_pm_tools_present_when_flag_on() -> None:
    registry = ensure_tools_registered(
        ToolRegistry(), include_write=False, include_semantic=False, include_pm=True
    )
    assert all(registry.has(name) for name in _PM_NAMES)
    # every PM tool is a read-only analytics tool
    for name in _PM_NAMES:
        tool = registry.get(name)
        assert tool is not None
        assert tool.spec.category == "analytics"
        assert tool.spec.mutating is False
