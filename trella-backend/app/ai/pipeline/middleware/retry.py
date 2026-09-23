"""Retry middleware.

Retries only *transient infrastructure* failures (provider timeout / provider
unavailable by default) with exponential backoff. Application-level failures
(``InvalidPrompt``, ``InvalidResponse``, and any other ``AIError`` not listed in
``retry_on``) are re-raised immediately -- retrying them would only burn quota.

Streaming retries the *initiation* only: the first delta is pulled inside the
retry loop, so a transient error before the first token restarts a fresh stream;
once the first delta is yielded the rest is relayed as-is (a mid-stream failure
cannot be replayed without duplicating already-emitted tokens).

``base_delay_s`` defaults to 0.0 so the unit suite never actually sleeps; a
later "profiles" task supplies real values via the constructor.
"""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator

from app.ai.pipeline.base import (
    AICallContext,
    AIMiddleware,
    AIResult,
    Handler,
    StreamHandler,
)
from app.ai.utils.errors import ProviderTimeout, ProviderUnavailable

_DEFAULT_RETRY_ON: tuple[type[Exception], ...] = (ProviderTimeout, ProviderUnavailable)


class RetryMiddleware(AIMiddleware):
    """Retry transient provider failures with exponential backoff."""

    supports_streaming = True

    def __init__(
        self,
        attempts: int = 3,
        base_delay_s: float = 0.0,
        retry_on: tuple[type[Exception], ...] = _DEFAULT_RETRY_ON,
    ) -> None:
        if attempts < 1:
            raise ValueError("attempts must be >= 1")
        if base_delay_s < 0:
            raise ValueError("base_delay_s must be >= 0")
        self._attempts = attempts
        self._base_delay_s = base_delay_s
        self._retry_on = retry_on

    async def _backoff(self, ctx: AICallContext, attempt: int) -> None:
        """Record the retry and sleep ``base_delay_s * 2**attempt`` seconds."""
        ctx.trace.retry_count += 1
        if self._base_delay_s > 0:
            await asyncio.sleep(self._base_delay_s * 2**attempt)

    async def handle(self, ctx: AICallContext, nxt: Handler) -> AIResult:
        for attempt in range(self._attempts):
            try:
                return await nxt(ctx)
            except self._retry_on:
                if attempt == self._attempts - 1:
                    raise
                await self._backoff(ctx, attempt)
        raise RuntimeError("unreachable")  # pragma: no cover

    async def handle_stream(
        self, ctx: AICallContext, nxt: StreamHandler
    ) -> AsyncIterator[str]:
        for attempt in range(self._attempts):
            try:
                it = nxt(ctx)
                first = await it.__anext__()
            except StopAsyncIteration:
                return  # empty stream initiated cleanly -- nothing to retry
            except self._retry_on:
                if attempt == self._attempts - 1:
                    raise
                await self._backoff(ctx, attempt)
                continue
            # First delta obtained: initiation succeeded, relay the rest as-is.
            # ponytail: no mid-stream retry -- replaying would duplicate tokens.
            yield first
            async for delta in it:
                yield delta
            return
