"""P4-B6 checks: base service streaming on ProviderMessage + smart truncation.

No network: a fake provider whose ``stream()`` is an async generator yielding
scripted deltas and recording the messages it received.
"""

import asyncio
import logging
from collections.abc import AsyncIterator

import pytest

from app.ai.providers.base import AIProvider, ProviderMessage
from app.ai.services.ai_base_service import AIBaseService
from app.ai.utils.errors import RateLimited


class _FakeStreamProvider(AIProvider):
    name = "fake"

    def __init__(
        self, deltas: list[str] | None = None, exc: Exception | None = None
    ) -> None:
        self._deltas = deltas or []
        self._exc = exc
        self.seen_messages: list[ProviderMessage] | None = None

    async def generate(  # type: ignore[override]
        self,
        *,
        prompt: str,
        model: str | None = None,
        temperature: float = 0.0,
        max_tokens: int | None = None,
        timeout: float | None = None,
    ):
        raise NotImplementedError

    async def health_check(self) -> bool:
        return True

    async def stream(
        self,
        *,
        messages: list[ProviderMessage],
        model: str | None = None,
        temperature: float = 0.0,
        max_tokens: int | None = None,
        timeout: float | None = None,
    ) -> AsyncIterator[str]:
        self.seen_messages = messages
        if self._exc is not None:
            raise self._exc
        for delta in self._deltas:
            yield delta


async def _collect(service: AIBaseService, **kwargs) -> list[str]:
    return [d async for d in service.run_stream(**kwargs)]


def test_run_stream_yields_in_order_with_system_prepended() -> None:
    provider = _FakeStreamProvider(["Hel", "lo", "!"])
    service = AIBaseService(provider)
    history = [ProviderMessage("user", "hi"), ProviderMessage("assistant", "hey")]

    out = asyncio.run(
        _collect(service, system_message="SYS", messages=history, feature="chat")
    )

    assert out == ["Hel", "lo", "!"]
    assert provider.seen_messages is not None
    assert provider.seen_messages[0] == ProviderMessage("system", "SYS")
    assert provider.seen_messages[1:] == history


def test_smart_truncation_keeps_system_latest_user_and_assistant(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Tiny limit so the long middle history must be trimmed.
    from app.ai.services import ai_base_service

    monkeypatch.setattr(ai_base_service.settings, "AI_MAX_PROMPT_CHARS", 40)
    monkeypatch.setattr(ai_base_service.settings, "AI_MODEL_MAX_PROMPT_CHARS", {})

    provider = _FakeStreamProvider(["ok"])
    service = AIBaseService(provider)
    # Middle history is large; latest user + assistant are short & must survive.
    history = [
        ProviderMessage("user", "OLD-USER " * 10),
        ProviderMessage("assistant", "OLD-ASSISTANT " * 10),
        ProviderMessage("user", "MID " * 10),
        ProviderMessage("user", "LATEST-USER"),
        ProviderMessage("assistant", "LATEST-ASSISTANT"),
    ]

    asyncio.run(
        _collect(service, system_message="SYSTEM", messages=history, feature="chat")
    )

    seen = provider.seen_messages
    assert seen is not None
    # System survives at index 0.
    assert seen[0] == ProviderMessage("system", "SYSTEM")
    # Latest user + latest assistant survive.
    assert ProviderMessage("user", "LATEST-USER") in seen
    assert ProviderMessage("assistant", "LATEST-ASSISTANT") in seen
    # At least one middle message was dropped.
    assert len(seen) < len(history) + 1


def test_telemetry_events_emitted(caplog: pytest.LogCaptureFixture) -> None:
    provider = _FakeStreamProvider(["a", "b"])
    service = AIBaseService(provider)
    with caplog.at_level(logging.INFO, logger="app.ai"):
        asyncio.run(
            _collect(
                service,
                system_message="SYS",
                messages=[ProviderMessage("user", "hi")],
                feature="chat",
            )
        )
    text = "\n".join(r.getMessage() for r in caplog.records)
    assert "AI_REQUEST_STARTED" in text
    assert "AI_REQUEST_SUCCESS" in text


def test_stream_error_logs_failure_and_propagates(
    caplog: pytest.LogCaptureFixture,
) -> None:
    provider = _FakeStreamProvider(exc=RateLimited("slow down"))
    service = AIBaseService(provider)
    with caplog.at_level(logging.INFO, logger="app.ai"):
        with pytest.raises(RateLimited):
            asyncio.run(
                _collect(
                    service,
                    system_message="SYS",
                    messages=[ProviderMessage("user", "hi")],
                    feature="chat",
                )
            )
    text = "\n".join(r.getMessage() for r in caplog.records)
    assert "AI_REQUEST_FAILED" in text
    assert "ok=False" in text
