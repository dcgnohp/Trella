"""Metrics middleware.

Folds every unary and streaming call into an aggregate :class:`MetricsCollector`
(counters + cost rollups). Success/latency come from the result; a raised
exception is recorded as a failure and then re-raised so error handling upstream
is unchanged. This layer records counters only -- per-request detail is the
tracing middleware's job.
"""

from __future__ import annotations

import time
from collections.abc import AsyncIterator

from app.ai.pipeline.base import (
    AICallContext,
    AIMiddleware,
    AIResult,
    Handler,
    StreamHandler,
)
from app.ai.telemetry.metrics import MetricsCollector


class MetricsMiddleware(AIMiddleware):
    """Record aggregate counters/cost for each AI call (success and failure)."""

    supports_streaming = True

    def __init__(self, collector: MetricsCollector) -> None:
        self._collector = collector

    async def handle(self, ctx: AICallContext, nxt: Handler) -> AIResult:
        start = time.monotonic()
        try:
            result = await nxt(ctx)
        except Exception:
            self._collector.record(
                feature=ctx.feature,
                provider=ctx.trace.provider,
                model=ctx.model or ctx.trace.model,
                success=False,
                latency_ms=_elapsed_ms(start),
                cost=None,
                cache_decision=ctx.trace.cache_decision,
            )
            raise
        self._collector.record(
            feature=ctx.feature,
            provider=result.provider or ctx.trace.provider,
            model=result.model or ctx.model or ctx.trace.model,
            success=True,
            latency_ms=result.latency_ms or _elapsed_ms(start),
            cost=result.cost,
            cache_decision=ctx.trace.cache_decision,
        )
        return result

    async def handle_stream(
        self, ctx: AICallContext, nxt: StreamHandler
    ) -> AsyncIterator[str]:
        """Relay the stream; record one aggregate row when it ends.

        Latency is measured around the whole stream and cost stays ``None``
        (streaming deltas carry no usage totals). A mid-stream failure records a
        failure then re-raises. ponytail: best-effort per-stream accounting;
        upgrade path is a usage-bearing final chunk feeding real cost here.
        """
        start = time.monotonic()
        try:
            async for delta in nxt(ctx):
                yield delta
        except Exception:
            self._collector.record(
                feature=ctx.feature,
                provider=ctx.trace.provider,
                model=ctx.model or ctx.trace.model,
                success=False,
                latency_ms=_elapsed_ms(start),
                cost=None,
                cache_decision=ctx.trace.cache_decision,
            )
            raise
        self._collector.record(
            feature=ctx.feature,
            provider=ctx.trace.provider,
            model=ctx.model or ctx.trace.model,
            success=True,
            latency_ms=_elapsed_ms(start),
            cost=None,
            cache_decision=ctx.trace.cache_decision,
        )


def _elapsed_ms(start: float) -> int:
    return int((time.monotonic() - start) * 1000)
