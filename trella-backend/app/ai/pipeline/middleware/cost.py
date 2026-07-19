"""Cost tracking middleware.

Estimates the USD cost of a unary call from token usage and a per-model pricing
table (``$ per 1K tokens``), writes it onto ``AIResult.cost``, and emits one
non-sensitive ``AI_COST`` telemetry event. Pricing is config-driven: the table
arrives via the constructor so ops can fill ``settings.AI_MODEL_PRICING``
without editing code here. An unknown model (or missing token counts) leaves
``cost`` as ``None`` rather than crashing.
"""

from __future__ import annotations

from collections.abc import AsyncIterator

from app.ai.pipeline.base import (
    AICallContext,
    AIMiddleware,
    AIResult,
    Handler,
    StreamHandler,
)
from app.ai.utils.logging import emit_event

# USD cost is rounded to 6 decimals -- well below a cent for any realistic call.
_COST_PRECISION = 6


class CostMiddleware(AIMiddleware):
    """Estimate per-call cost from token usage and a per-model pricing table."""

    supports_streaming = True

    def __init__(self, pricing: dict[str, dict[str, float]]) -> None:
        self._pricing = pricing

    async def handle(self, ctx: AICallContext, nxt: Handler) -> AIResult:
        result = await nxt(ctx)
        result.cost = self._estimate(result)
        emit_event(
            "AI_COST",
            feature=ctx.feature,
            provider=result.provider,
            model=result.model,
            cost=result.cost,
            prompt_tokens=result.usage.get("prompt_tokens"),
            completion_tokens=result.usage.get("completion_tokens"),
        )
        return result

    def handle_stream(
        self, ctx: AICallContext, nxt: StreamHandler
    ) -> AsyncIterator[str]:
        """Relay the stream untouched -- cost tracking is a no-op for streams.

        Streaming deltas carry no usage totals, so cost cannot be computed here
        and stays ``None``.
        ponytail: upgrade path is a usage-bearing final chunk from the provider;
        this layer would then accumulate tokens and emit ``AI_COST`` on close.
        """
        return nxt(ctx)

    def _estimate(self, result: AIResult) -> float | None:
        """USD cost from token usage; ``None`` if model unknown or no tokens."""
        price = self._pricing.get(result.model)
        if price is None:
            return None
        prompt_tokens = result.usage.get("prompt_tokens")
        completion_tokens = result.usage.get("completion_tokens")
        if prompt_tokens is None and completion_tokens is None:
            return None
        cost = (prompt_tokens or 0) / 1000 * price.get("input", 0.0) + (
            completion_tokens or 0
        ) / 1000 * price.get("output", 0.0)
        return round(cost, _COST_PRECISION)
