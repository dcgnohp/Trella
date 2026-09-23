"""Tests for the Tool Budget policy (P8).

Pure and fast: no DB, no network, no sleeps. Latency is driven by a fake clock
(``_FakeClock``) whose ``now`` we advance by hand, so time-based limits are
deterministic.
"""

from __future__ import annotations

from app.ai.reasoning.budget import BudgetTracker, ToolBudget


class _FakeClock:
    """A controllable monotonic source: read via ``__call__``, move via ``advance``."""

    def __init__(self, start: float = 0.0) -> None:
        self.now = start

    def advance(self, dt: float) -> None:
        self.now += dt

    def __call__(self) -> float:
        return self.now


def test_under_all_limits_is_none() -> None:
    clock = _FakeClock()
    t = BudgetTracker(ToolBudget(max_cost=10.0), time_fn=clock)
    t.record_iteration()
    t.record_tool_call()
    t.record_cost(1.0)
    clock.advance(1.0)
    assert t.exceeded() is None


def test_exceed_max_tool_calls() -> None:
    t = BudgetTracker(ToolBudget(max_tool_calls=2), time_fn=_FakeClock())
    t.record_tool_call(3)
    assert t.exceeded() == "max_tool_calls"


def test_exceed_max_iterations() -> None:
    # Big tool-call budget so only the iteration axis can trip.
    t = BudgetTracker(
        ToolBudget(max_tool_calls=100, max_iterations=2), time_fn=_FakeClock()
    )
    for _ in range(3):
        t.record_iteration()
    assert t.exceeded() == "max_iterations"


def test_exceed_max_latency() -> None:
    clock = _FakeClock()
    t = BudgetTracker(ToolBudget(max_latency_s=5.0), time_fn=clock)
    assert t.exceeded() is None
    clock.advance(5.0)
    assert t.exceeded() is None  # exactly at the limit is still fine
    clock.advance(0.01)
    assert t.exceeded() == "max_latency_s"


def test_cost_cap_disabled_by_default() -> None:
    # max_cost=0.0 (default) disables the axis even for a huge recorded cost.
    t = BudgetTracker(ToolBudget(), time_fn=_FakeClock())
    t.record_cost(1_000_000.0)
    assert t.exceeded() is None


def test_cost_cap_enabled() -> None:
    t = BudgetTracker(ToolBudget(max_cost=1.0), time_fn=_FakeClock())
    t.record_cost(0.5)
    assert t.exceeded() is None
    t.record_cost(0.6)  # total 1.1 > 1.0
    assert t.exceeded() == "max_cost"


def test_deterministic_priority_tool_calls_before_latency() -> None:
    clock = _FakeClock()
    t = BudgetTracker(
        ToolBudget(max_tool_calls=1, max_latency_s=1.0, max_cost=1.0),
        time_fn=clock,
    )
    t.record_tool_call(5)  # trips tool_calls
    t.record_iteration()
    clock.advance(100.0)  # also trips latency
    t.record_cost(100.0)  # also trips cost
    # tool_calls is first in the deterministic order.
    assert t.exceeded() == "max_tool_calls"


def test_deterministic_priority_iterations_before_latency() -> None:
    clock = _FakeClock()
    t = BudgetTracker(
        ToolBudget(max_tool_calls=100, max_iterations=1, max_latency_s=1.0),
        time_fn=clock,
    )
    t.record_iteration()
    t.record_iteration()  # trips iterations
    clock.advance(100.0)  # also trips latency
    assert t.exceeded() == "max_iterations"


def test_elapsed_s_reflects_clock() -> None:
    clock = _FakeClock(start=100.0)
    t = BudgetTracker(ToolBudget(), time_fn=clock)
    clock.advance(2.5)
    assert t.elapsed_s == 2.5
