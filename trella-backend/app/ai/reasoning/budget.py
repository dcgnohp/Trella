"""Tool Budget — a reusable multi-axis limit policy for a reasoning run (P8).

Phase 7's :class:`ReasoningEngine` bounds its loop only by a tool-call *count*.
This module replaces that single knob with a small, pure policy that bounds
several dimensions at once — tool calls, reasoning iterations, wall-clock
latency, and (optionally) accumulated cost. The engine checks it each iteration
and terminates *gracefully* when ANY enabled limit is exceeded; this module
never raises and never does I/O.

Design notes:
- A limit ``<= 0`` DISABLES that axis. That's why ``max_cost`` defaults to
  ``0.0``: unknown provider pricing means "no cost cap" rather than "instant
  stop".
- ``time_fn`` is injectable so tests use a fake clock (no real sleeps) and so
  the engine can share a single monotonic source.
"""

from __future__ import annotations

import time
from collections.abc import Callable
from dataclasses import dataclass


@dataclass(frozen=True)
class ToolBudget:
    """Limits for one reasoning run. A limit <= 0 means 'disabled' for that axis."""

    max_tool_calls: int = 8
    max_iterations: int = 6
    max_latency_s: float = 60.0
    max_cost: float = 0.0  # 0 disables the cost cap (unknown pricing -> no cap)


class BudgetTracker:
    """Tracks consumption against a :class:`ToolBudget` for a single run."""

    def __init__(
        self, budget: ToolBudget, time_fn: Callable[[], float] = time.monotonic
    ) -> None:
        self.budget = budget
        self._time_fn = time_fn
        self._start = time_fn()
        self.tool_calls = 0
        self.iterations = 0
        self.cost = 0.0

    def record_iteration(self) -> None:
        """Call at the start of each reasoning turn."""
        self.iterations += 1

    def record_tool_call(self, n: int = 1) -> None:
        self.tool_calls += n

    def record_cost(self, cost: float) -> None:
        self.cost += cost

    @property
    def elapsed_s(self) -> float:
        return self._time_fn() - self._start

    def exceeded(self) -> str | None:
        """Return a short reason if ANY enabled limit is exceeded, else None.

        Checked in deterministic order — tool_calls, iterations, latency, cost —
        so callers get a stable "first" reason when several axes trip at once.
        An axis whose limit is ``<= 0`` is disabled and never triggers.
        """
        b = self.budget
        if b.max_tool_calls > 0 and self.tool_calls > b.max_tool_calls:
            return "max_tool_calls"
        if b.max_iterations > 0 and self.iterations > b.max_iterations:
            return "max_iterations"
        if b.max_latency_s > 0 and self.elapsed_s > b.max_latency_s:
            return "max_latency_s"
        if b.max_cost > 0 and self.cost > b.max_cost:
            return "max_cost"
        return None
