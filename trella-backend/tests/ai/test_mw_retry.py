"""P6-B1 checks: retry middleware.

No network: fake terminal handlers script a number of transient failures before
succeeding. Covers (1) unary retry of transient infra errors with
``retry_count`` bookkeeping, (2) non-transient ``AIError`` propagating without
retry, and (3) streaming retry of *initiation* only.
"""

import asyncio
from collections.abc import AsyncIterator

from app.ai.pipeline import AICallContext, AIPipeline, AIResult
from app.ai.pipeline.middleware.retry import RetryMiddleware
from app.ai.utils.errors import InvalidPrompt, ProviderTimeout, ProviderUnavailable


def _ctx(kind: str = "generate") -> AICallContext:
    return AICallContext(kind=kind, feature="t", model=None, params={}, payload={})  # type: ignore[arg-type]


async def _drain(it: AsyncIterator[str]) -> list[str]:
    return [d async for d in it]


def test_unary_retries_transient_then_succeeds() -> None:
    n = 3  # fail n-1 times, then succeed
    calls = {"count": 0}

    async def terminal(_c: AICallContext) -> AIResult:
        calls["count"] += 1
        if calls["count"] < n:
            raise ProviderUnavailable("nope")
        return AIResult(value="ok")

    ctx = _ctx()
    pipeline = AIPipeline([RetryMiddleware(attempts=3)])
    result = asyncio.run(pipeline.execute(ctx, terminal))

    assert result.value == "ok"
    assert calls["count"] == n
    assert ctx.trace.retry_count == n - 1


def test_unary_does_not_retry_invalid_prompt() -> None:
    calls = {"count": 0}

    async def terminal(_c: AICallContext) -> AIResult:
        calls["count"] += 1
        raise InvalidPrompt("bad")

    ctx = _ctx()
    pipeline = AIPipeline([RetryMiddleware(attempts=3)])

    try:
        asyncio.run(pipeline.execute(ctx, terminal))
    except InvalidPrompt:
        pass
    else:  # pragma: no cover
        raise AssertionError("InvalidPrompt should propagate")

    assert calls["count"] == 1  # never retried
    assert ctx.trace.retry_count == 0


def test_unary_exhausts_attempts_and_reraises() -> None:
    calls = {"count": 0}

    async def terminal(_c: AICallContext) -> AIResult:
        calls["count"] += 1
        raise ProviderTimeout("slow")

    ctx = _ctx()
    pipeline = AIPipeline([RetryMiddleware(attempts=3)])

    try:
        asyncio.run(pipeline.execute(ctx, terminal))
    except ProviderTimeout:
        pass
    else:  # pragma: no cover
        raise AssertionError("ProviderTimeout should propagate after exhaustion")

    assert calls["count"] == 3
    assert ctx.trace.retry_count == 2


def test_stream_retries_initiation_then_relays() -> None:
    attempts = {"count": 0}

    async def terminal(_c: AICallContext) -> AsyncIterator[str]:
        attempts["count"] += 1
        if attempts["count"] <= 2:
            raise ProviderTimeout("cold start")
        for delta in ("a", "b"):
            yield delta

    ctx = _ctx("stream")
    pipeline = AIPipeline([RetryMiddleware(attempts=3)])
    out = asyncio.run(_drain(pipeline.stream(ctx, terminal)))

    assert out == ["a", "b"]
    assert attempts["count"] == 3
    assert ctx.trace.retry_count == 2


def test_stream_does_not_retry_after_first_delta() -> None:
    attempts = {"count": 0}

    async def terminal(_c: AICallContext) -> AsyncIterator[str]:
        attempts["count"] += 1
        yield "a"
        raise ProviderUnavailable("mid-stream drop")

    ctx = _ctx("stream")
    pipeline = AIPipeline([RetryMiddleware(attempts=3)])

    got: list[str] = []
    try:
        asyncio.run(_collect_into(pipeline.stream(ctx, terminal), got))
    except ProviderUnavailable:
        pass
    else:  # pragma: no cover
        raise AssertionError("mid-stream error should propagate, not retry")

    assert got == ["a"]  # first delta relayed before the failure
    assert attempts["count"] == 1  # no re-initiation once streaming began
    assert ctx.trace.retry_count == 0


async def _collect_into(it: AsyncIterator[str], sink: list[str]) -> None:
    async for delta in it:
        sink.append(delta)
