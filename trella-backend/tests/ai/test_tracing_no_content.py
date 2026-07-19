"""P6-B6 checks: tracing holds NO prompt/completion content.

Builds a Span from a TraceContext and asserts the Span (and therefore the
collector) exposes only lifecycle metadata -- never prompt or completion text.
Also verifies the ring buffer is bounded.
"""

from __future__ import annotations

import dataclasses

from app.ai.pipeline.base import TraceContext
from app.ai.telemetry.tracing import Span, TracingCollector

# Any field name hinting at request/response body content is forbidden.
_FORBIDDEN = {
    "prompt",
    "completion",
    "content",
    "text",
    "message",
    "messages",
    "payload",
    "response",
    "value",
    "input",
    "output",
    "body",
}


def _span_from_trace(trace: TraceContext, *, success: bool, latency_ms: int) -> Span:
    return Span(
        feature=trace.feature,
        provider=trace.provider,
        model=trace.model,
        prompt_version=trace.prompt_version,
        retry_count=trace.retry_count,
        fallback_used=trace.fallback_used,
        cache_decision=trace.cache_decision,
        circuit_state=trace.circuit_state,
        success=success,
        latency_ms=latency_ms,
    )


def test_span_has_no_content_fields() -> None:
    field_names = {f.name for f in dataclasses.fields(Span)}
    assert field_names & _FORBIDDEN == set(), field_names


def test_span_built_from_trace_metadata_only() -> None:
    trace = TraceContext(
        feature="chat",
        provider="openai",
        model="gpt-4.1",
        prompt_version="v1",
        retry_count=1,
        fallback_used=True,
        cache_decision="miss",
        circuit_state="closed",
    )
    span = _span_from_trace(trace, success=True, latency_ms=42)
    collected = dataclasses.asdict(span)
    # Every value is metadata/outcome -- none of it is free-form content.
    assert set(collected) & _FORBIDDEN == set()
    assert collected["feature"] == "chat"
    assert collected["retry_count"] == 1
    assert collected["fallback_used"] is True
    assert collected["latency_ms"] == 42


def test_recent_is_bounded() -> None:
    c = TracingCollector(capacity=3)
    for i in range(10):
        c.record(
            Span(
                feature="chat",
                provider="openai",
                model="m",
                prompt_version="v1",
                retry_count=0,
                fallback_used=False,
                cache_decision="none",
                circuit_state=None,
                success=True,
                latency_ms=i,
            )
        )
    recent = c.recent()
    assert len(recent) == 3  # capacity, not 10
    assert [s.latency_ms for s in recent] == [7, 8, 9]  # oldest dropped
