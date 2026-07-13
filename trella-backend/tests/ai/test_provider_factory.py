"""B3 check: factory returns the configured provider; unknown -> clear error."""

from types import SimpleNamespace

import pytest

from app.ai.providers import get_provider
from app.ai.providers.openai_provider import OpenAIProvider
from app.ai.utils.errors import ProviderUnavailable
from app.core.config import settings


def test_returns_openai_provider() -> None:
    assert isinstance(get_provider(settings), OpenAIProvider)


def test_unknown_provider_raises() -> None:
    bogus = SimpleNamespace(
        AI_PROVIDER="gemini",  # not yet supported
        OPENAI_API_KEY=None,
        AI_DEFAULT_MODEL="x",
        AI_REQUEST_TIMEOUT=5.0,
    )
    with pytest.raises(ProviderUnavailable):
        get_provider(bogus)  # type: ignore[arg-type]
