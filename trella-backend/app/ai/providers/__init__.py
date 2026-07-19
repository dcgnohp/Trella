"""Provider selection.

``get_provider`` returns the configured provider. Adding a new vendor later
(Gemini, Ollama, ...) is a new branch here plus a provider class — no change to
services or routers (``.ai/AI_ARCHITECTURE.md`` §4).

When ``settings.AI_FALLBACK_PROVIDER`` names a second, different vendor,
``get_provider`` returns a :class:`FailoverProvider` wrapping ``[primary,
fallback]`` — transparent to services because it implements ``AIProvider``. With
no fallback configured the plain primary is returned, preserving prior behaviour.
"""

from __future__ import annotations

from typing import Literal

from app.ai.providers.base import AIProvider, GenerationResult
from app.ai.providers.failover import FailoverProvider
from app.ai.providers.gemini_provider import GeminiProvider
from app.ai.providers.openai_provider import OpenAIProvider
from app.ai.utils.errors import ProviderUnavailable
from app.core.config import Settings

__all__ = [
    "AIProvider",
    "FailoverProvider",
    "GeminiProvider",
    "GenerationResult",
    "OpenAIProvider",
    "get_embedding_provider",
    "get_provider",
]


def _build(name: Literal["openai", "gemini"], settings: Settings) -> AIProvider:
    """Construct a single concrete provider by name."""
    if name == "openai":
        return OpenAIProvider(
            api_key=settings.OPENAI_API_KEY,
            default_model=settings.AI_DEFAULT_MODEL,
            timeout=settings.AI_REQUEST_TIMEOUT,
        )
    if name == "gemini":
        return GeminiProvider(
            api_key=settings.GEMINI_API_KEY,
            default_model=settings.AI_DEFAULT_MODEL,
            timeout=settings.AI_REQUEST_TIMEOUT,
        )
    # Kept so an unsupported provider fails loud and clear.
    raise ProviderUnavailable(f"Unknown AI provider: {name!r}")


def get_provider(settings: Settings) -> AIProvider:
    """Build the AI provider selected by ``settings.AI_PROVIDER``.

    With ``AI_FALLBACK_PROVIDER`` set to a different vendor, wrap primary and
    fallback in a :class:`FailoverProvider`; otherwise return the plain primary.
    """
    primary = _build(settings.AI_PROVIDER, settings)

    fallback_name = getattr(settings, "AI_FALLBACK_PROVIDER", None)
    if fallback_name and fallback_name != settings.AI_PROVIDER:
        fallback = _build(fallback_name, settings)
        return FailoverProvider([primary, fallback])

    return primary


def get_embedding_provider(settings: Settings) -> AIProvider:
    """Build the provider used for embeddings (Phase 9).

    Selected ENTIRELY from config via ``AI_EMBEDDING_PROVIDER`` — independent of
    ``AI_PROVIDER`` (chat) and never defaulted to a vendor in code. Raises
    :class:`ProviderUnavailable` when it is not configured (fail loud).
    """
    name = settings.AI_EMBEDDING_PROVIDER
    if name is None:
        raise ProviderUnavailable("AI_EMBEDDING_PROVIDER is not configured.")
    return _build(name, settings)
