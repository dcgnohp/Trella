"""Rolling, in-memory provider health.

Tracks the outcomes of recent provider calls (success/failure, latency, whether
a failure was a timeout) over a bounded window and derives a coarse health
status the failover layer uses to order candidates. Only *infrastructure*
failures are recorded here — content errors (bad prompt / bad response) say
nothing about whether the provider is reachable, so callers must not report
them (see ``.ai/AI_ARCHITECTURE.md`` §10 error taxonomy).

ponytail: state is per-process and in-memory (a bounded ``deque``). That is
fine for a single worker; the upgrade path for multi-worker deployments is to
back the window with Redis so health is shared across processes.
"""

from __future__ import annotations

from collections import deque
from enum import Enum


class ProviderHealth(str, Enum):
    """Coarse health derived from the recent call window."""

    HEALTHY = "healthy"
    DEGRADED = "degraded"
    UNAVAILABLE = "unavailable"


class _Outcome:
    """One recorded call outcome kept in the rolling window."""

    __slots__ = ("failed", "timeout", "latency_ms")

    def __init__(self, *, failed: bool, timeout: bool, latency_ms: int) -> None:
        self.failed = failed
        self.timeout = timeout
        self.latency_ms = latency_ms


class ProviderHealthTracker:
    """Rolling in-memory health from recent calls.

    Health is derived from the last ``window`` outcomes:

    * ``UNAVAILABLE`` when the failure rate reaches ``failure_threshold``.
    * ``DEGRADED`` when successful but slow (average latency over
      ``degraded_latency_ms``) or timing out often (timeout rate over
      ``degraded_timeout_rate``).
    * ``HEALTHY`` otherwise (including the empty/no-data case: unproven
      providers are optimistically healthy so a fresh process will try them).
    """

    def __init__(
        self,
        window: int = 20,
        failure_threshold: float = 0.5,
        degraded_latency_ms: int = 8000,
        degraded_timeout_rate: float = 0.2,
    ) -> None:
        if window < 1:
            raise ValueError("window must be >= 1")
        self._window = window
        self._failure_threshold = failure_threshold
        self._degraded_latency_ms = degraded_latency_ms
        self._degraded_timeout_rate = degraded_timeout_rate
        self._outcomes: deque[_Outcome] = deque(maxlen=window)

    def record_success(self, latency_ms: int) -> None:
        """Record a successful call and its latency in milliseconds."""
        self._outcomes.append(
            _Outcome(failed=False, timeout=False, latency_ms=max(0, latency_ms))
        )

    def record_failure(self, *, timeout: bool) -> None:
        """Record an infrastructure failure (``timeout`` marks a timeout)."""
        self._outcomes.append(_Outcome(failed=True, timeout=timeout, latency_ms=0))

    def status(self) -> ProviderHealth:
        """Derive current health from the recorded window."""
        total = len(self._outcomes)
        if total == 0:
            return ProviderHealth.HEALTHY

        failures = sum(1 for o in self._outcomes if o.failed)
        if failures / total >= self._failure_threshold:
            return ProviderHealth.UNAVAILABLE

        timeouts = sum(1 for o in self._outcomes if o.timeout)
        if timeouts / total > self._degraded_timeout_rate:
            return ProviderHealth.DEGRADED

        successes = [o for o in self._outcomes if not o.failed]
        if successes:
            avg_latency = sum(o.latency_ms for o in successes) / len(successes)
            if avg_latency > self._degraded_latency_ms:
                return ProviderHealth.DEGRADED

        return ProviderHealth.HEALTHY

    def snapshot(self) -> dict[str, object]:
        """Return non-sensitive rolling metrics for observability."""
        total = len(self._outcomes)
        successes = [o for o in self._outcomes if not o.failed]
        avg_latency = (
            sum(o.latency_ms for o in successes) / len(successes) if successes else 0.0
        )
        timeouts = sum(1 for o in self._outcomes if o.timeout)
        return {
            "status": self.status().value,
            "samples": total,
            "recent_failures": sum(1 for o in self._outcomes if o.failed),
            "avg_latency_ms": round(avg_latency, 1),
            "timeout_rate": round(timeouts / total, 3) if total else 0.0,
        }
