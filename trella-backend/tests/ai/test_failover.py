"""P6-B2 check: health-aware failover across providers (no network)."""

import asyncio
from collections.abc import AsyncIterator

import pytest

from app.ai.providers.base import AIProvider, GenerationResult, ProviderMessage
from app.ai.providers.failover import FailoverProvider
from app.ai.utils.errors import (
    InvalidPrompt,
    ProviderTimeout,
    ProviderUnavailable,
)


class _FakeProvider(AIProvider):
    """Scriptable provider: replays a result, an exception, or stream chunks."""

    def __init__(
        self,
        name: str,
        *,
        result: str | None = None,
        exc: Exception | None = None,
        chunks: list[str] | None = None,
    ) -> None:
        self.name = name
        self._result = result
        self._exc = exc
        self._chunks = chunks
        self.calls = 0

    async def generate(self, **_: object) -> GenerationResult:
        self.calls += 1
        if self._exc is not None:
            raise self._exc
        return GenerationResult(
            content=self._result or "", model="m", provider=self.name
        )

    async def health_check(self) -> bool:
        if self._exc is not None:
            raise self._exc
        return True

    async def stream(
        self, *, messages: list[ProviderMessage], **_: object
    ) -> AsyncIterator[str]:
        self.calls += 1
        if self._exc is not None:
            raise self._exc
        for chunk in self._chunks or []:
            yield chunk


_MSG = [ProviderMessage(role="user", content="hi")]


def test_single_provider_passthrough() -> None:
    p = _FakeProvider("solo", result="ok")
    fo = FailoverProvider([p])
    result = asyncio.run(fo.generate(prompt="x"))
    assert result.content == "ok"
    assert result.provider == "solo"
    assert p.calls == 1


def test_primary_infra_error_fails_over_to_fallback() -> None:
    primary = _FakeProvider("primary", exc=ProviderUnavailable("down"))
    fallback = _FakeProvider("fallback", result="rescued")
    fo = FailoverProvider([primary, fallback])
    result = asyncio.run(fo.generate(prompt="x"))
    assert result.provider == "fallback"
    assert result.content == "rescued"
    assert primary.calls == 1
    assert fallback.calls == 1


def test_timeout_fails_over() -> None:
    primary = _FakeProvider("primary", exc=ProviderTimeout("slow"))
    fallback = _FakeProvider("fallback", result="ok")
    fo = FailoverProvider([primary, fallback])
    assert asyncio.run(fo.generate(prompt="x")).provider == "fallback"


def test_content_error_reraised_without_failover() -> None:
    primary = _FakeProvider("primary", exc=InvalidPrompt("bad"))
    fallback = _FakeProvider("fallback", result="should-not-run")
    fo = FailoverProvider([primary, fallback])
    with pytest.raises(InvalidPrompt):
        asyncio.run(fo.generate(prompt="x"))
    assert fallback.calls == 0  # no failover on content errors


def test_all_unavailable_raises_provider_unavailable() -> None:
    p1 = _FakeProvider("p1", exc=ProviderUnavailable("down"))
    p2 = _FakeProvider("p2", exc=ProviderTimeout("slow"))
    fo = FailoverProvider([p1, p2])
    with pytest.raises(ProviderUnavailable):
        asyncio.run(fo.generate(prompt="x"))
    assert p1.calls == 1
    assert p2.calls == 1


def test_unhealthy_primary_is_deprioritized_after_failing() -> None:
    # After the primary fails once its health drops to UNAVAILABLE, so later
    # calls prefer the healthy fallback and stop hitting the failing primary.
    primary = _FakeProvider("primary", exc=ProviderUnavailable("down"))
    fallback = _FakeProvider("fallback", result="ok")
    fo = FailoverProvider([primary, fallback])

    # First call: primary tried, fails, fallback rescues.
    assert asyncio.run(fo.generate(prompt="x")).provider == "fallback"
    assert primary.calls == 1

    # Subsequent calls go straight to the healthy fallback.
    for _ in range(3):
        assert asyncio.run(fo.generate(prompt="x")).provider == "fallback"
    assert primary.calls == 1  # deprioritized: not probed again


def test_stream_fails_over_on_initiation() -> None:
    primary = _FakeProvider("primary", exc=ProviderUnavailable("down"))
    fallback = _FakeProvider("fallback", chunks=["a", "b", "c"])
    fo = FailoverProvider([primary, fallback])

    async def collect() -> list[str]:
        return [chunk async for chunk in fo.stream(messages=_MSG)]

    assert asyncio.run(collect()) == ["a", "b", "c"]


def test_stream_content_error_reraised() -> None:
    primary = _FakeProvider("primary", exc=InvalidPrompt("bad"))
    fallback = _FakeProvider("fallback", chunks=["x"])
    fo = FailoverProvider([primary, fallback])

    async def collect() -> list[str]:
        return [chunk async for chunk in fo.stream(messages=_MSG)]

    with pytest.raises(InvalidPrompt):
        asyncio.run(collect())
    assert fallback.calls == 0


def test_health_check_true_if_any_healthy() -> None:
    primary = _FakeProvider("primary", exc=ProviderUnavailable("down"))
    fallback = _FakeProvider("fallback", result="ok")
    fo = FailoverProvider([primary, fallback])
    assert asyncio.run(fo.health_check()) is True
