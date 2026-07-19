"""P6-B6 checks: metrics + tracing middlewares through the pipeline.

Runs both middlewares around a terminal handler and asserts both collectors are
updated on the success path, and that a raised exception is recorded as a
failure (and re-raised) by both.
"""

from __future__ import annotations

import asyncio

import pytest

from app.ai.pipeline import AICallContext, AIPipeline, AIResult
from app.ai.pipeline.base import TraceContext
from app.ai.pipeline.middleware.metrics import MetricsMiddleware
from app.ai.pipeline.middleware.tracing import TracingMiddleware
from app.ai.telemetry.metrics import MetricsCollector
from app.ai.telemetry.tracing import TracingCollector


def _ctx() -> AICallContext:
    return AICallContext(
        kind="generate",
        feature="chat",
        model="gpt-4.1",
        params={},
        payload={},
        trace=TraceContext(
            feature="chat",
            provider="openai",
            model="gpt-4.1",
            prompt_version="v1",
            cache_decision="miss",
        ),
    )


def _pipeline(metrics: MetricsCollector, tracing: TracingCollector) -> AIPipeline:
    return AIPipeline([MetricsMiddleware(metrics), TracingMiddleware(tracing)])


def test_success_updates_both_collectors() -> None:
    metrics = MetricsCollector()
    tracing = TracingCollector()

    async def terminal(_c: AICallContext) -> AIResult:
        return AIResult(
            value="ok",
            provider="openai",
            model="gpt-4.1",
            latency_ms=123,
            cost=0.05,
        )

    asyncio.run(_pipeline(metrics, tracing).execute(_ctx(), terminal))

    key = metrics.snapshot()["by_key"]["chat:openai:gpt-4.1"]
    assert key["requests"] == 1
    assert key["successes"] == 1
    assert key["total_cost"] == 0.05
    assert key["cache_misses"] == 1

    spans = tracing.recent()
    assert len(spans) == 1
    assert spans[0].success is True
    assert spans[0].feature == "chat"
    assert spans[0].latency_ms == 123


def test_failure_records_failure_and_reraises() -> None:
    metrics = MetricsCollector()
    tracing = TracingCollector()

    async def terminal(_c: AICallContext) -> AIResult:
        raise RuntimeError("boom")

    with pytest.raises(RuntimeError):
        asyncio.run(_pipeline(metrics, tracing).execute(_ctx(), terminal))

    key = metrics.snapshot()["by_key"]["chat:openai:gpt-4.1"]
    assert key["failures"] == 1
    assert key["successes"] == 0

    spans = tracing.recent()
    assert len(spans) == 1
    assert spans[0].success is False


def test_stream_records_on_completion() -> None:
    metrics = MetricsCollector()
    tracing = TracingCollector()

    async def terminal(_c: AICallContext):
        yield "a"
        yield "b"

    async def drain() -> list[str]:
        out: list[str] = []
        async for delta in _pipeline(metrics, tracing).stream(_ctx(), terminal):
            out.append(delta)
        return out

    assert asyncio.run(drain()) == ["a", "b"]
    assert metrics.snapshot()["by_key"]["chat:openai:gpt-4.1"]["successes"] == 1
    assert tracing.recent()[0].success is True
