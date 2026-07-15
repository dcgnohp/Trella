"""B3 check: factory returns the configured provider; unknown -> clear error."""

from types import SimpleNamespace

import pytest

from app.ai.providers import get_provider
from app.ai.providers.gemini_provider import GeminiProvider
from app.ai.providers.openai_provider import OpenAIProvider
from app.ai.utils.errors import ProviderUnavailable


def test_returns_openai_provider() -> None:
    # Env-independent: the real ``settings`` may select any provider, so pass an
    # explicit openai config here.
    cfg = SimpleNamespace(
        AI_PROVIDER="openai",
        OPENAI_API_KEY=None,
        GEMINI_API_KEY=None,
        AI_DEFAULT_MODEL="gpt-4.1",
        AI_REQUEST_TIMEOUT=5.0,
    )
    assert isinstance(get_provider(cfg), OpenAIProvider)  # type: ignore[arg-type]


def test_returns_gemini_provider() -> None:
    cfg = SimpleNamespace(
        AI_PROVIDER="gemini",
        OPENAI_API_KEY=None,
        GEMINI_API_KEY=None,
        AI_DEFAULT_MODEL="gemini-2.0-flash",
        AI_REQUEST_TIMEOUT=5.0,
    )
    assert isinstance(get_provider(cfg), GeminiProvider)  # type: ignore[arg-type]


def test_unknown_provider_raises() -> None:
    bogus = SimpleNamespace(
        AI_PROVIDER="ollama",  # not supported
        OPENAI_API_KEY=None,
        GEMINI_API_KEY=None,
        AI_DEFAULT_MODEL="x",
        AI_REQUEST_TIMEOUT=5.0,
    )
    with pytest.raises(ProviderUnavailable):
        get_provider(bogus)  # type: ignore[arg-type]
