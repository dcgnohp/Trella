"""Tests for CacheMiddleware (P6-B3).

Drives the middleware through ``AIPipeline`` with a counting terminal to assert
hit/miss/skip decisions and cache-key sensitivity.
"""

from __future__ import annotations

import asyncio
from typing import Any

from app.ai.pipeline import AICallContext, AIPipeline, AIResult
from app.ai.pipeline.middleware.cache import CacheMiddleware
from app.ai.utils.cache import TTLCache


class _CountingTerminal:
    """Terminal handler that counts invocations and returns a fresh result."""

    def __init__(self) -> None:
        self.calls = 0

    async def __call__(self, _ctx: AICallContext) -> AIResult:
        self.calls += 1
        return AIResult(value=f"result-{self.calls}")


def _ctx(
    *,
    payload: dict[str, Any] | None = None,
    params: dict[str, Any] | None = None,
    feature: str = "generate_description",
    model: str | None = "m",
) -> AICallContext:
    return AICallContext(
        kind="structured",
        feature=feature,
        model=model,
        params=params or {},
        payload=payload if payload is not None else {"variables": {"x": 1}},
    )


def _run(
    pipeline: AIPipeline, ctx: AICallContext, terminal: _CountingTerminal
) -> AIResult:
    return asyncio.run(pipeline.execute(ctx, terminal))


def test_identical_ctx_second_call_is_hit() -> None:
    terminal = _CountingTerminal()
    pipeline = AIPipeline([CacheMiddleware(TTLCache())])

    first_ctx = _ctx()
    first = _run(pipeline, first_ctx, terminal)
    assert first_ctx.trace.cache_decision == "miss"

    second_ctx = _ctx()
    second = _run(pipeline, second_ctx, terminal)

    assert terminal.calls == 1  # second served from cache
    assert second_ctx.trace.cache_decision == "hit"
    assert second.value == first.value


def test_different_payload_is_miss() -> None:
    terminal = _CountingTerminal()
    pipeline = AIPipeline([CacheMiddleware(TTLCache())])

    _run(pipeline, _ctx(payload={"variables": {"x": 1}}), terminal)
    ctx2 = _ctx(payload={"variables": {"x": 2}})
    _run(pipeline, ctx2, terminal)

    assert terminal.calls == 2
    assert ctx2.trace.cache_decision == "miss"


def test_not_cacheable_always_calls_terminal_and_skips() -> None:
    terminal = _CountingTerminal()
    pipeline = AIPipeline([CacheMiddleware(TTLCache())])

    payload = {"variables": {"x": 1}, "cacheable": False}
    ctx1 = _ctx(payload=dict(payload))
    ctx2 = _ctx(payload=dict(payload))
    _run(pipeline, ctx1, terminal)
    _run(pipeline, ctx2, terminal)

    assert terminal.calls == 2
    assert ctx1.trace.cache_decision == "skip"
    assert ctx2.trace.cache_decision == "skip"


def test_changing_prompt_version_is_miss() -> None:
    terminal = _CountingTerminal()
    pipeline = AIPipeline([CacheMiddleware(TTLCache())])

    _run(pipeline, _ctx(params={"prompt_version": "v1"}), terminal)
    ctx2 = _ctx(params={"prompt_version": "v2"})
    _run(pipeline, ctx2, terminal)

    assert terminal.calls == 2  # new prompt_version -> new key
    assert ctx2.trace.cache_decision == "miss"


def test_policy_keys_excluded_from_key() -> None:
    # cache_tier differing must NOT change the key (it's policy, not input).
    terminal = _CountingTerminal()
    pipeline = AIPipeline([CacheMiddleware(TTLCache())])

    _run(
        pipeline, _ctx(payload={"variables": {"x": 1}, "cache_tier": "long"}), terminal
    )
    ctx2 = _ctx(payload={"variables": {"x": 1}, "cache_tier": "medium"})
    _run(pipeline, ctx2, terminal)

    assert terminal.calls == 1
    assert ctx2.trace.cache_decision == "hit"


def test_non_serializable_payload_still_keys() -> None:
    # A type object in the payload must not crash key building (str() fallback).
    terminal = _CountingTerminal()
    pipeline = AIPipeline([CacheMiddleware(TTLCache())])

    payload = {"variables": {"x": 1}, "response_model": AIResult}
    ctx1 = _ctx(payload=dict(payload))
    ctx2 = _ctx(payload=dict(payload))
    _run(pipeline, ctx1, terminal)
    _run(pipeline, ctx2, terminal)

    assert terminal.calls == 1
    assert ctx2.trace.cache_decision == "hit"
