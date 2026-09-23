"""P4-B1 check: provider streaming yields deltas from chat messages.

No network: the vendor async clients are faked (mirrors the fake-client style
in ``test_openai_provider.py`` / ``test_gemini_provider.py``) and coroutines are
driven with ``asyncio.run``. A stream is ``await``-ed to obtain an async
iterator, then iterated — matching how the providers consume the real SDKs.
"""

import asyncio
from collections.abc import AsyncIterator, Iterable
from types import SimpleNamespace
from typing import Any

import openai
import pytest
from google.genai import errors

from app.ai.providers.base import ProviderMessage
from app.ai.providers.gemini_provider import GeminiProvider
from app.ai.providers.openai_provider import OpenAIProvider
from app.ai.utils.errors import AIError, ProviderUnavailable


async def _aiter(items: Iterable[Any]) -> AsyncIterator[Any]:
    for item in items:
        yield item


async def _collect(stream: AsyncIterator[str]) -> list[str]:
    return [delta async for delta in stream]


# --- OpenAI ---------------------------------------------------------------


def _oa_chunk(text: str | None) -> Any:
    return SimpleNamespace(
        choices=[SimpleNamespace(delta=SimpleNamespace(content=text))]
    )


class _FakeOpenAICreate:
    """Awaitable that returns a scripted async stream (or raises)."""

    def __init__(self, chunks: list[Any], exc: Exception | None = None) -> None:
        self._chunks = chunks
        self._exc = exc
        self.kwargs: dict[str, Any] | None = None

    async def __call__(self, **kwargs: Any) -> Any:
        self.kwargs = kwargs
        if self._exc is not None:
            raise self._exc
        return _aiter(self._chunks)


def _openai(create: _FakeOpenAICreate) -> OpenAIProvider:
    client = SimpleNamespace(
        chat=SimpleNamespace(completions=SimpleNamespace(create=create))
    )
    return OpenAIProvider(
        api_key="x", default_model="gpt-4.1-mini", timeout=5.0, client=client
    )


def test_openai_stream_yields_deltas_and_passes_messages() -> None:
    # A trailing usage-only chunk (no choices) must be skipped, not yielded.
    create = _FakeOpenAICreate(
        chunks=[_oa_chunk("Hel"), _oa_chunk("lo"), _oa_chunk(None), _oa_chunk("!")]
    )
    provider = _openai(create)
    messages = [
        ProviderMessage(role="system", content="be brief"),
        ProviderMessage(role="user", content="hi"),
    ]
    deltas = asyncio.run(_collect(provider.stream(messages=messages)))
    assert deltas == ["Hel", "lo", "!"]
    assert create.kwargs is not None
    assert create.kwargs["messages"] == [
        {"role": "system", "content": "be brief"},
        {"role": "user", "content": "hi"},
    ]
    assert create.kwargs["stream"] is True


def test_openai_stream_init_error_maps_to_ai_error() -> None:
    req = SimpleNamespace()
    create = _FakeOpenAICreate(chunks=[], exc=openai.APIConnectionError(request=req))
    provider = _openai(create)
    with pytest.raises(ProviderUnavailable):
        asyncio.run(_collect(provider.stream(messages=[ProviderMessage("user", "x")])))


# --- Gemini ---------------------------------------------------------------


class _FakeGeminiStream:
    """Awaitable that returns a scripted async stream (or raises)."""

    def __init__(self, chunks: list[Any], exc: Exception | None = None) -> None:
        self._chunks = chunks
        self._exc = exc
        self.kwargs: dict[str, Any] | None = None

    async def __call__(self, **kwargs: Any) -> Any:
        self.kwargs = kwargs
        if self._exc is not None:
            raise self._exc
        return _aiter(self._chunks)


def _gemini(stream: _FakeGeminiStream) -> GeminiProvider:
    client = SimpleNamespace(
        aio=SimpleNamespace(models=SimpleNamespace(generate_content_stream=stream))
    )
    return GeminiProvider(
        api_key="x", default_model="gemini-2.0-flash", timeout=5.0, client=client
    )


def test_gemini_stream_yields_texts_and_routes_system() -> None:
    stream = _FakeGeminiStream(
        chunks=[SimpleNamespace(text="Hel"), SimpleNamespace(text="lo")]
    )
    provider = _gemini(stream)
    messages = [
        ProviderMessage(role="system", content="you are helpful"),
        ProviderMessage(role="user", content="hi"),
        ProviderMessage(role="assistant", content="hey"),
    ]
    deltas = asyncio.run(_collect(provider.stream(messages=messages)))
    assert deltas == ["Hel", "lo"]

    assert stream.kwargs is not None
    config = stream.kwargs["config"]
    assert config.system_instruction == "you are helpful"
    # System message routed away from contents; assistant maps to "model".
    contents = stream.kwargs["contents"]
    assert [c.role for c in contents] == ["user", "model"]


def test_gemini_stream_init_error_maps_to_ai_error() -> None:
    stream = _FakeGeminiStream(
        chunks=[], exc=errors.APIError(500, {"error": {"message": "boom"}}, None)
    )
    provider = _gemini(stream)
    with pytest.raises(AIError):
        asyncio.run(_collect(provider.stream(messages=[ProviderMessage("user", "x")])))
