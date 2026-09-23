"""Phase 9: provider-agnostic embeddings.

No network: the OpenAI / google-genai clients are faked (mirrors the existing
provider tests) and coroutines are driven with ``asyncio.run``. Covers order
preservation, empty-input short-circuit, unified error mapping, the ABC default,
and the config-driven ``get_embedding_provider`` factory.
"""

import asyncio
from types import SimpleNamespace
from typing import Any

import httpx
import openai
import pytest
from google.genai import errors

from app.ai.providers import get_embedding_provider
from app.ai.providers.base import AIProvider
from app.ai.providers.gemini_provider import GeminiProvider
from app.ai.providers.openai_provider import OpenAIProvider
from app.ai.utils.errors import ProviderTimeout, ProviderUnavailable, RateLimited

_REQ = httpx.Request("POST", "https://api.openai.com/v1/embeddings")
_RESP = httpx.Response(429, request=_REQ)


class _FakeCall:
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


# --------------------------------------------------------------------------- #
# OpenAI provider embed                                                        #
# --------------------------------------------------------------------------- #
def _openai(create: _FakeCall, max_retries: int = 3) -> OpenAIProvider:
    client = SimpleNamespace(embeddings=SimpleNamespace(create=create))
    return OpenAIProvider(
        api_key="x",
        default_model="text-embedding-3-small",
        timeout=5.0,
        max_retries=max_retries,
        client=client,
    )


def _openai_result(vectors: list[list[float]]) -> Any:
    return SimpleNamespace(data=[SimpleNamespace(embedding=v) for v in vectors])


def test_openai_embed_returns_vectors_in_order() -> None:
    create = _FakeCall(result=_openai_result([[0.1, 0.2], [0.3, 0.4]]))
    out = asyncio.run(_openai(create).embed(["a", "b"], model="m"))
    assert out == [[0.1, 0.2], [0.3, 0.4]]
    assert create.calls == 1


def test_openai_embed_empty_input_short_circuits() -> None:
    create = _FakeCall(result=_openai_result([]))
    out = asyncio.run(_openai(create).embed([]))
    assert out == []
    assert create.calls == 0  # SDK never called


def test_openai_embed_timeout_maps_and_retries() -> None:
    create = _FakeCall(exc=openai.APITimeoutError(request=_REQ))
    with pytest.raises(ProviderTimeout):
        asyncio.run(_openai(create, max_retries=3).embed(["a"], model="m"))
    assert create.calls == 3


def test_openai_embed_rate_limit_maps() -> None:
    create = _FakeCall(exc=openai.RateLimitError("rl", response=_RESP, body=None))
    with pytest.raises(RateLimited):
        asyncio.run(_openai(create, max_retries=1).embed(["a"], model="m"))


def test_openai_embed_other_error_maps_to_unavailable() -> None:
    create = _FakeCall(
        exc=openai.AuthenticationError("bad key", response=_RESP, body=None)
    )
    with pytest.raises(ProviderUnavailable):
        asyncio.run(_openai(create, max_retries=1).embed(["a"], model="m"))


# --------------------------------------------------------------------------- #
# Gemini provider embed                                                        #
# --------------------------------------------------------------------------- #
def _gemini(embed: _FakeCall, max_retries: int = 3) -> GeminiProvider:
    client = SimpleNamespace(
        aio=SimpleNamespace(models=SimpleNamespace(embed_content=embed))
    )
    return GeminiProvider(
        api_key="x",
        default_model="text-embedding-004",
        timeout=5.0,
        max_retries=max_retries,
        client=client,
    )


def _gemini_result(vectors: list[list[float]]) -> Any:
    return SimpleNamespace(embeddings=[SimpleNamespace(values=v) for v in vectors])


def _api_error(code: int) -> errors.APIError:
    return errors.APIError(code, {"error": {"message": "boom"}}, None)


def test_gemini_embed_returns_vectors_in_order() -> None:
    embed = _FakeCall(result=_gemini_result([[1.0, 2.0], [3.0, 4.0]]))
    out = asyncio.run(_gemini(embed).embed(["a", "b"], model="m"))
    assert out == [[1.0, 2.0], [3.0, 4.0]]
    assert embed.calls == 1


def test_gemini_embed_empty_input_short_circuits() -> None:
    embed = _FakeCall(result=_gemini_result([]))
    out = asyncio.run(_gemini(embed).embed([]))
    assert out == []
    assert embed.calls == 0


def test_gemini_embed_timeout_maps_and_retries() -> None:
    embed = _FakeCall(exc=httpx.ReadTimeout("slow"))
    with pytest.raises(ProviderTimeout):
        asyncio.run(_gemini(embed, max_retries=2).embed(["a"], model="m"))
    assert embed.calls == 2


def test_gemini_embed_rate_limit_maps() -> None:
    embed = _FakeCall(exc=_api_error(429))
    with pytest.raises(RateLimited):
        asyncio.run(_gemini(embed, max_retries=1).embed(["a"], model="m"))


def test_gemini_embed_other_error_maps_to_unavailable() -> None:
    embed = _FakeCall(exc=_api_error(500))
    with pytest.raises(ProviderUnavailable):
        asyncio.run(_gemini(embed, max_retries=1).embed(["a"], model="m"))


# --------------------------------------------------------------------------- #
# ABC default + factory                                                        #
# --------------------------------------------------------------------------- #
class _BareProvider(AIProvider):
    name = "bare"

    async def generate(self, **_: Any) -> Any:  # pragma: no cover - not used
        raise NotImplementedError

    async def health_check(self) -> bool:  # pragma: no cover - not used
        return True


def test_base_embed_default_raises() -> None:
    with pytest.raises(NotImplementedError):
        asyncio.run(_BareProvider().embed(["a"]))


def _settings(provider: str | None) -> Any:
    return SimpleNamespace(
        AI_EMBEDDING_PROVIDER=provider,
        AI_PROVIDER="gemini",
        OPENAI_API_KEY="x",
        GEMINI_API_KEY="y",
        AI_DEFAULT_MODEL="ignored-chat-model",
        AI_REQUEST_TIMEOUT=5.0,
    )


def test_factory_raises_when_unconfigured() -> None:
    with pytest.raises(ProviderUnavailable):
        get_embedding_provider(_settings(None))


def test_factory_builds_selected_provider() -> None:
    assert isinstance(get_embedding_provider(_settings("openai")), OpenAIProvider)
    assert isinstance(get_embedding_provider(_settings("gemini")), GeminiProvider)
