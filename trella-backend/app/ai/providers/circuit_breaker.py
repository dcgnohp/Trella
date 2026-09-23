"""A minimal circuit breaker for provider calls.

Complements :class:`ProviderHealthTracker`: health *ranks* providers, the
breaker *stops* hammering one that is clearly down. Standard three-state model:

* ``CLOSED`` — calls flow; consecutive failures trip it ``OPEN``.
* ``OPEN`` — calls are rejected until ``cooldown_s`` elapses, then a single
  probe is allowed (``HALF_OPEN``).
* ``HALF_OPEN`` — one probe in flight; success closes the breaker, failure
  re-opens it and restarts the cooldown.

The clock is injectable so tests advance time deterministically instead of
sleeping.
"""

from __future__ import annotations

import time
from collections.abc import Callable
from enum import Enum


class CircuitState(str, Enum):
    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half_open"


class CircuitBreaker:
    """Trips ``OPEN`` after ``failure_threshold`` consecutive failures."""

    def __init__(
        self,
        failure_threshold: int = 5,
        cooldown_s: float = 30.0,
        time_fn: Callable[[], float] = time.monotonic,
    ) -> None:
        if failure_threshold < 1:
            raise ValueError("failure_threshold must be >= 1")
        self._failure_threshold = failure_threshold
        self._cooldown_s = cooldown_s
        self._time_fn = time_fn
        self._failures = 0
        self._opened_at: float | None = None
        self._state = CircuitState.CLOSED

    @property
    def state(self) -> CircuitState:
        """Current state, transitioning ``OPEN`` -> ``HALF_OPEN`` on cooldown."""
        if self._state is CircuitState.OPEN and self._cooldown_elapsed():
            self._state = CircuitState.HALF_OPEN
        return self._state

    def allow(self) -> bool:
        """Return whether a call may proceed. ``False`` only when ``OPEN``."""
        return self.state is not CircuitState.OPEN

    def record_success(self) -> None:
        """A successful call: close the breaker and reset counters."""
        self._failures = 0
        self._opened_at = None
        self._state = CircuitState.CLOSED

    def record_failure(self) -> None:
        """A failed call: trip ``OPEN`` on threshold, or re-open from probe."""
        # Resolve any pending cooldown transition first (OPEN -> HALF_OPEN).
        if self.state is CircuitState.HALF_OPEN:
            self._trip_open()
            return
        self._failures += 1
        if self._failures >= self._failure_threshold:
            self._trip_open()

    def _trip_open(self) -> None:
        self._state = CircuitState.OPEN
        self._opened_at = self._time_fn()

    def _cooldown_elapsed(self) -> bool:
        return (
            self._opened_at is not None
            and (self._time_fn() - self._opened_at) >= self._cooldown_s
        )
