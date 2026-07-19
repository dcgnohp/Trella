"""Tracing middleware.

Records one :class:`Span` per AI call -- the ``TraceContext`` metadata plus the
outcome (success/latency). It NEVER copies prompt/completion content: the Span
type has no content fields, so there is nothing to leak here. This is separate
from the metrics middleware on purpose (per-request detail vs aggregate
counters).
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
from app.ai.telemetry.tracing import Span, TracingCollector


class TracingMiddleware(AIMiddleware):
    """Record a per-request lifecycle span (metadata + outcome, no content)."""

    supports_streaming = True

    def __init__(self, collector: TracingCollector) -> None:
        self._collector = collector

    async def handle(self, ctx: AICallContext, nxt: Handler) -> AIResult:
        start = time.monotonic()
        try:
            result = await nxt(ctx)
        except Exception:
            self._collector.record(
                self._span(ctx, success=False, latency_ms=_elapsed_ms(start))
            )
            raise
        latency = result.latency_ms or _elapsed_ms(start)
        self._collector.record(self._span(ctx, success=True, latency_ms=latency))
        return result

    async def handle_stream(
        self, ctx: AICallContext, nxt: StreamHandler
    ) -> AsyncIterator[str]:
        start = time.monotonic()
        try:
            async for delta in nxt(ctx):
                yield delta
        except Exception:
            self._collector.record(
                self._span(ctx, success=False, latency_ms=_elapsed_ms(start))
            )
            raise
        self._collector.record(
            self._span(ctx, success=True, latency_ms=_elapsed_ms(start))
        )

    @staticmethod
    def _span(ctx: AICallContext, *, success: bool, latency_ms: int) -> Span:
        """Build a Span from lifecycle metadata only -- no prompt/completion."""
        t = ctx.trace
        return Span(
            feature=ctx.feature,
            provider=t.provider,
            model=t.model or (ctx.model or ""),
            prompt_version=t.prompt_version,
            retry_count=t.retry_count,
            fallback_used=t.fallback_used,
            cache_decision=t.cache_decision,
            circuit_state=t.circuit_state,
            success=success,
            latency_ms=latency_ms,
        )


def _elapsed_ms(start: float) -> int:
    return int((time.monotonic() - start) * 1000)
