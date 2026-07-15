"""Provider abstraction.

Business modules never talk to a vendor SDK directly (``.ai/AI_ARCHITECTURE.md``
§2). They depend on :class:`AIProvider`; concrete providers translate their SDK
into this interface and raise the unified errors in ``app.ai.utils.errors``.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Generic, TypeVar

from app.core.base import CamelModel

# Parsed structured outputs are always ``CamelModel`` subclasses so the wire
# stays camelCase (see ``ai_schema``). Target Python 3.10 — classic ``TypeVar``
# rather than PEP 695 ``def f[T]`` syntax.
T = TypeVar("T", bound="CamelModel")


@dataclass(frozen=True)
class GenerationResult:
    """A single, non-streamed completion returned by a provider."""

    content: str
    model: str
    provider: str
    prompt_tokens: int | None = None
    completion_tokens: int | None = None
    total_tokens: int | None = None


@dataclass(frozen=True)
class StructuredResult(Generic[T]):
    """A single completion parsed into a pydantic ``response_model`` instance."""

    parsed: T
    model: str
    provider: str
    prompt_tokens: int | None = None
    completion_tokens: int | None = None
    total_tokens: int | None = None


class AIProvider(ABC):
    """Uniform, provider-agnostic LLM interface."""

    #: Stable provider identifier (e.g. ``"openai"``).
    name: str

    @abstractmethod
    async def generate(
        self,
        *,
        prompt: str,
        model: str | None = None,
        temperature: float = 0.0,
        max_tokens: int | None = None,
        timeout: float | None = None,
    ) -> GenerationResult:
        """Return a single completion for ``prompt``."""

    async def generate_structured(
        self,
        *,
        prompt: str,
        response_model: type[T],
        model: str | None = None,
        temperature: float = 0.0,
        max_tokens: int | None = None,
        timeout: float | None = None,
    ) -> StructuredResult[T]:
        """Return ``prompt`` parsed into a ``response_model`` instance.

        The frozen signature every provider overrides. A concrete default (not
        ``@abstractmethod``) mirrors ``stream`` above so existing providers/fakes
        that predate structured output stay instantiable; concrete providers
        override it.
        """
        # ponytail: default raises rather than being abstract to avoid breaking
        # pre-existing AIProvider subclasses; every real provider overrides this.
        raise NotImplementedError("Structured generation is not implemented.")

    @abstractmethod
    async def health_check(self) -> bool:
        """Return ``True`` when the provider is reachable and configured."""

    async def stream(
        self,
        *,
        prompt: str,
        model: str | None = None,
        temperature: float = 0.0,
        max_tokens: int | None = None,
    ) -> object:
        # ponytail: streaming is intentionally deferred to Phase 4 (AI Chat).
        # Declared here so the interface is stable and Phase 4 only implements it.
        raise NotImplementedError("Streaming is introduced in Phase 4 (AI Chat).")
