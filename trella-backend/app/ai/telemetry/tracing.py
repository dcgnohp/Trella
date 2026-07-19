"""Per-request AI tracing.

A ``Span`` is the lifecycle summary of one AI call: the ``TraceContext``
metadata plus the outcome (success/latency). It is intentionally NOT a metrics
row and -- by design and by test -- it NEVER holds prompt or completion content
(``.ai/AI_ARCHITECTURE.md`` §12-13). Only the fields declared below exist.

ponytail: in-memory bounded ring buffer, per-process. Ceiling: the oldest spans
fall off after ``maxlen`` and nothing survives a restart. Upgrade path is an
OpenTelemetry exporter behind the same ``record`` call.
"""

from __future__ import annotations

from collections import deque
from dataclasses import dataclass

_DEFAULT_CAPACITY = 500


@dataclass
class Span:
    """Lifecycle summary of one AI call. NO content fields, by design."""

    feature: str
    provider: str
    model: str
    prompt_version: str
    retry_count: int
    fallback_used: bool
    cache_decision: str
    circuit_state: str | None
    success: bool
    latency_ms: int


class TracingCollector:
    """Bounded ring buffer of recent spans."""

    def __init__(self, capacity: int = _DEFAULT_CAPACITY) -> None:
        self._spans: deque[Span] = deque(maxlen=capacity)

    def record(self, span: Span) -> None:
        self._spans.append(span)

    def recent(self, limit: int = 100) -> list[Span]:
        """Most-recent-last spans, capped at ``limit`` (bounded by the buffer)."""
        spans = list(self._spans)
        return spans[-limit:] if limit >= 0 else spans

    def reset(self) -> None:
        self._spans.clear()


# Module-level default collector shared by the middleware and the router.
_default_collector = TracingCollector()


def get_tracing_collector() -> TracingCollector:
    """Accessor for the process-wide default collector."""
    return _default_collector
