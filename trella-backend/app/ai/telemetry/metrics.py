"""Aggregate AI metrics.

Counters only -- one row per ``(feature, provider, model)`` plus daily/monthly
cost rollups. This is deliberately separate from tracing (per-request spans):
metrics answer "how much / how often / how expensive", tracing answers "what
happened on this one call". Neither ever holds prompt/completion content
(``.ai/AI_ARCHITECTURE.md`` §12-13).

ponytail: in-memory, per-process (a global lock is unnecessary because CPython
dict mutations here are single-statement). Ceiling: counters reset on restart
and don't aggregate across workers. Upgrade path is a Prometheus client -- the
``record``/``snapshot`` surface stays, the storage swaps.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

# Averages/costs are rounded so snapshots are stable to compare and log.
_LATENCY_PRECISION = 2
_COST_PRECISION = 6


@dataclass
class _KeyStat:
    """Accumulators for one ``(feature, provider, model)`` key."""

    requests: int = 0
    successes: int = 0
    failures: int = 0
    cache_hits: int = 0
    cache_misses: int = 0
    total_latency_ms: int = 0
    total_cost: float = 0.0


@dataclass
class _Rollup:
    """Requests + cost aggregated for a date (``YYYY-MM-DD``) or month key."""

    requests: int = 0
    total_cost: float = 0.0


def _avg(total: float, count: int, precision: int) -> float | None:
    """Rounded mean, or ``None`` when there is nothing to average."""
    return round(total / count, precision) if count else None


@dataclass
class MetricsCollector:
    """In-memory aggregate metrics. ponytail: per-process; upgrade = Prometheus."""

    now_fn: Callable[[], datetime] = lambda: datetime.now(timezone.utc)
    _keys: dict[tuple[str, str, str], _KeyStat] = field(default_factory=dict)
    _daily: dict[str, _Rollup] = field(default_factory=dict)
    _monthly: dict[str, _Rollup] = field(default_factory=dict)

    def record(
        self,
        *,
        feature: str,
        provider: str,
        model: str,
        success: bool,
        latency_ms: int,
        cost: float | None,
        cache_decision: str,
    ) -> None:
        """Fold one call into the per-key counters and the date rollups."""
        stat = self._keys.setdefault((feature, provider, model), _KeyStat())
        stat.requests += 1
        if success:
            stat.successes += 1
        else:
            stat.failures += 1
        if cache_decision == "hit":
            stat.cache_hits += 1
        elif cache_decision == "miss":
            stat.cache_misses += 1
        stat.total_latency_ms += latency_ms
        stat.total_cost += cost or 0.0

        now = self.now_fn()
        day_key = now.strftime("%Y-%m-%d")
        month_key = now.strftime("%Y-%m")
        for bucket, key in ((self._daily, day_key), (self._monthly, month_key)):
            roll = bucket.setdefault(key, _Rollup())
            roll.requests += 1
            roll.total_cost += cost or 0.0

    def snapshot(self) -> dict[str, Any]:
        """Derived view: per-key stats + averages + daily/monthly rollups."""
        by_key = {
            f"{feature}:{provider}:{model}": {
                "feature": feature,
                "provider": provider,
                "model": model,
                "requests": s.requests,
                "successes": s.successes,
                "failures": s.failures,
                "cache_hits": s.cache_hits,
                "cache_misses": s.cache_misses,
                "avg_latency_ms": _avg(
                    s.total_latency_ms, s.requests, _LATENCY_PRECISION
                ),
                "total_cost": round(s.total_cost, _COST_PRECISION),
                "avg_cost": _avg(s.total_cost, s.requests, _COST_PRECISION),
                "cost_per_successful_request": _avg(
                    s.total_cost, s.successes, _COST_PRECISION
                ),
            }
            for (feature, provider, model), s in self._keys.items()
        }
        return {
            "by_key": by_key,
            "daily": self._rollup_view(self._daily),
            "monthly": self._rollup_view(self._monthly),
        }

    @staticmethod
    def _rollup_view(bucket: dict[str, _Rollup]) -> dict[str, Any]:
        return {
            key: {
                "requests": r.requests,
                "total_cost": round(r.total_cost, _COST_PRECISION),
            }
            for key, r in bucket.items()
        }

    def reset(self) -> None:
        """Drop all counters (used by tests and manual ops)."""
        self._keys.clear()
        self._daily.clear()
        self._monthly.clear()


# Module-level default collector shared by the middleware and the router.
_default_collector = MetricsCollector()


def get_metrics_collector() -> MetricsCollector:
    """Accessor for the process-wide default collector."""
    return _default_collector
