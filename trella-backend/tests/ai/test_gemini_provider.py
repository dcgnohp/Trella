"""Gemini provider: maps SDK errors, retries transient, parses structured JSON.

No network: the google-genai client is faked (mirrors the OpenAI provider test
style) and coroutines are driven with ``asyncio.run``.
"""

import asyncio
from types import SimpleNamespace
from typing import Any

import httpx
import pytest
from google.genai import errors

from app.ai.providers.base import StructuredResult
from app.ai.providers.gemini_provider import GeminiProvider
from app.ai.utils.errors import (
    InvalidResponse,
    ProviderTimeout,
    ProviderUnavailable,
    RateLimited,
)
from app.core.base import CamelModel


class _Desc(CamelModel):
    description: str


def _api_error(code: int) -> errors.APIError:
    # APIError(code, response_json, response=None)
    return errors.APIError(code, {"error": {"message": "boom"}}, None)


class _FakeGenerate:
    """Replays a scripted response or exception; counts calls."""

    def __init__(self, result: Any = None, exc: Exception | None = None) -> None:
        self.calls = 0
        self._result = result
        self._exc = exc

    async def __call__(self, **_: Any) -> Any:
        self.calls += 1
        if self._exc is not None:
            raise self._exc
        return self._result


def _client(generate: _FakeGenerate) -> Any:
    return SimpleNamespace(
        aio=SimpleNamespace(models=SimpleNamespace(generate_content=generate))
    )


def _usage() -> Any:
    return SimpleNamespace(
        prompt_token_count=4, candidates_token_count=6, total_token_count=10
    )


def _provider(generate: _FakeGenerate, max_retries: int = 3) -> GeminiProvider:
    return GeminiProvider(
        api_key="x",
        default_model="gemini-2.0-flash",
        timeout=5.0,
        max_retries=max_retries,
        client=_client(generate),
    )


def test_generate_happy_path() -> None:
    generate = _FakeGenerate(
        result=SimpleNamespace(text="hello", usage_metadata=_usage())
    )
    result = asyncio.run(_provider(generate).generate(prompt="hi"))
    assert result.content == "hello"
    assert result.provider == "gemini"
    assert result.total_tokens == 10
    assert generate.calls == 1


def test_generate_structured_parses_json() -> None:
    generate = _FakeGenerate(
        result=SimpleNamespace(
            text='{"description": "do the thing"}', usage_metadata=_usage()
        )
    )
    result = asyncio.run(
        _provider(generate).generate_structured(prompt="x", response_model=_Desc)
    )
    assert isinstance(result, StructuredResult)
    assert result.parsed.description == "do the thing"
    assert result.prompt_tokens == 4


def test_structured_empty_text_raises_invalid_response() -> None:
    generate = _FakeGenerate(result=SimpleNamespace(text="", usage_metadata=None))
    with pytest.raises(InvalidResponse):
        asyncio.run(
            _provider(generate).generate_structured(prompt="x", response_model=_Desc)
        )


def test_rate_limit_maps_and_retries() -> None:
    generate = _FakeGenerate(exc=_api_error(429))
    with pytest.raises(RateLimited):
        asyncio.run(_provider(generate, max_retries=3).generate(prompt="x"))
    assert generate.calls == 3


def test_timeout_maps_and_retries() -> None:
    generate = _FakeGenerate(exc=httpx.ReadTimeout("slow"))
    with pytest.raises(ProviderTimeout):
        asyncio.run(_provider(generate, max_retries=2).generate(prompt="x"))
    assert generate.calls == 2


def test_other_api_error_maps_to_unavailable() -> None:
    generate = _FakeGenerate(exc=_api_error(500))
    with pytest.raises(ProviderUnavailable):
        asyncio.run(_provider(generate, max_retries=1).generate(prompt="x"))
    assert generate.calls == 1


def test_health_check_false_without_key() -> None:
    provider = GeminiProvider(
        api_key=None, default_model="gemini-2.0-flash", timeout=5.0
    )
    assert asyncio.run(provider.health_check()) is False
