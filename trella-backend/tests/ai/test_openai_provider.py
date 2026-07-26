"""B2 check: OpenAI provider maps SDK errors and retries transient ones."""

import asyncio
from types import SimpleNamespace
from typing import Any

import httpx
import openai
import pytest
from pydantic import BaseModel, ValidationError

from app.ai.providers.openai_provider import OpenAIProvider
from app.ai.utils.errors import (
    InvalidResponse,
    ProviderTimeout,
    ProviderUnavailable,
    RateLimited,
)

_REQ = httpx.Request("POST", "https://api.openai.com/v1/chat/completions")
_RESP = httpx.Response(429, request=_REQ)


class _FakeCreate:
    """Records call count and replays a scripted result/exception."""

    def __init__(self, result: Any = None, exc: Exception | None = None) -> None:
        self.calls = 0
        self._result = result
        self._exc = exc

    async def __call__(self, **_: Any) -> Any:
        self.calls += 1
        if self._exc is not None:
            raise self._exc
        return self._result


def _client(create: _FakeCreate) -> Any:
    return SimpleNamespace(
        chat=SimpleNamespace(completions=SimpleNamespace(create=create))
    )


def _ok() -> Any:
    return SimpleNamespace(
        choices=[SimpleNamespace(message=SimpleNamespace(content="hi"))],
        usage=SimpleNamespace(prompt_tokens=3, completion_tokens=5),
    )


def _provider(create: _FakeCreate, max_retries: int = 3) -> OpenAIProvider:
    return OpenAIProvider(
        api_key="x",
        default_model="gpt-4.1-mini",
        timeout=5.0,
        max_retries=max_retries,
        client=_client(create),
    )


def test_generate_happy_path() -> None:
    create = _FakeCreate(result=_ok())
    result = asyncio.run(_provider(create).generate(prompt="hello"))
    assert result.content == "hi"
    assert result.provider == "openai"
    assert result.prompt_tokens == 3
    assert create.calls == 1


def test_timeout_maps_and_is_retried() -> None:
    create = _FakeCreate(exc=openai.APITimeoutError(request=_REQ))
    with pytest.raises(ProviderTimeout):
        asyncio.run(_provider(create, max_retries=3).generate(prompt="hello"))
    assert create.calls == 3  # retried up to max_retries


def test_rate_limit_maps_to_rate_limited() -> None:
    create = _FakeCreate(exc=openai.RateLimitError("rl", response=_RESP, body=None))
    with pytest.raises(RateLimited):
        asyncio.run(_provider(create, max_retries=2).generate(prompt="hello"))
    assert create.calls == 2


def test_other_sdk_error_maps_to_unavailable() -> None:
    create = _FakeCreate(
        exc=openai.AuthenticationError("bad key", response=_RESP, body=None)
    )
    with pytest.raises(ProviderUnavailable):
        asyncio.run(_provider(create, max_retries=1).generate(prompt="hello"))
    assert create.calls == 1


class _Schema(BaseModel):
    value: int


def _validation_error() -> ValidationError:
    """A real pydantic ValidationError, as the SDK raises when a model returns
    prose/malformed JSON that doesn't conform to the response schema."""
    try:
        _Schema.model_validate_json("not json at all")
    except ValidationError as exc:
        return exc
    raise AssertionError("expected a ValidationError")  # pragma: no cover


def _parse_client(parse: _FakeCreate) -> Any:
    return SimpleNamespace(
        beta=SimpleNamespace(
            chat=SimpleNamespace(completions=SimpleNamespace(parse=parse))
        )
    )


def test_structured_validation_error_maps_to_invalid_and_not_retried() -> None:
    # A non-structured-capable model (e.g. some free OpenRouter models) returns
    # content that fails schema parsing -> InvalidResponse, handled not 500.
    parse = _FakeCreate(exc=_validation_error())
    provider = OpenAIProvider(
        api_key="x",
        default_model="gpt-4.1-mini",
        timeout=5.0,
        max_retries=3,
        client=_parse_client(parse),
    )
    with pytest.raises(InvalidResponse):
        asyncio.run(
            provider.generate_structured(prompt="hi", response_model=_Schema)
        )
    assert parse.calls == 1  # not transient -> no retry
