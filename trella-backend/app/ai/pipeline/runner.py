"""Pipeline runner.

Composes a list of middlewares into a single onion around a terminal handler.
``execute`` runs unary calls (generate/structured); ``stream`` runs streaming
calls and skips middlewares that declare ``supports_streaming = False`` (e.g. a
cache that can only serve whole responses). Closures bind the current
middleware and next handler via default args so each layer captures the right
values (not the loop's final iteration).
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


class AIPipeline:
    def __init__(self, middlewares: list[AIMiddleware]) -> None:
        self._mw = middlewares

    async def execute(self, ctx: AICallContext, terminal: Handler) -> AIResult:
        handler = terminal
        for mw in reversed(self._mw):
            nxt = handler

            async def wrapped(
                c: AICallContext,
                _mw: AIMiddleware = mw,
                _nxt: Handler = nxt,
            ) -> AIResult:
                return await _mw.handle(c, _nxt)

            handler = wrapped
        return await handler(ctx)

    def stream(self, ctx: AICallContext, terminal: StreamHandler) -> AsyncIterator[str]:
        handler = terminal
        for mw in reversed(self._mw):
            if not mw.supports_streaming:  # e.g. cache is unary-only
                continue
            nxt = handler

            def wrapped(
                c: AICallContext,
                _mw: AIMiddleware = mw,
                _nxt: StreamHandler = nxt,
            ) -> AsyncIterator[str]:
                return _mw.handle_stream(c, _nxt)

            handler = wrapped
        return handler(ctx)
