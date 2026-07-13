"""Provider selection.

``get_provider`` returns the configured provider. Adding a new vendor later
(Gemini, Ollama, ...) is a new branch here plus a provider class — no change to
services or routers (``.ai/AI_ARCHITECTURE.md`` §4).
"""

from __future__ import annotations

from app.ai.providers.base import AIProvider, GenerationResult
from app.ai.providers.openai_provider import OpenAIProvider
from app.ai.utils.errors import ProviderUnavailable
from app.core.config import Settings

__all__ = ["AIProvider", "GenerationResult", "OpenAIProvider", "get_provider"]


def get_provider(settings: Settings) -> AIProvider:
    """Build the AI provider selected by ``settings.AI_PROVIDER``."""
    provider = settings.AI_PROVIDER
    if provider == "openai":
        return OpenAIProvider(
            api_key=settings.OPENAI_API_KEY,
            default_model=settings.AI_DEFAULT_MODEL,
            timeout=settings.AI_REQUEST_TIMEOUT,
        )
    # Unreachable while AI_PROVIDER is a single-value Literal, but kept so a
    # misconfiguration fails loud and clear once more providers are added.
    raise ProviderUnavailable(f"Unknown AI provider: {provider!r}")
