"""Provider abstraction.

Business modules never talk to a vendor SDK directly (``.ai/AI_ARCHITECTURE.md``
§2). They depend on :class:`AIProvider`; concrete providers translate their SDK
into this interface and raise the unified errors in ``app.ai.utils.errors``.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Any, Generic, TypeVar

from app.core.base import CamelModel

# Parsed structured outputs are always ``CamelModel`` subclasses so the wire
# stays camelCase (see ``ai_schema``). Target Python 3.10 — classic ``TypeVar``
# rather than PEP 695 ``def f[T]`` syntax.
T = TypeVar("T", bound="CamelModel")


@dataclass(frozen=True)
class ToolCallRequest:
    """A model's request to invoke a tool (Phase 7, P7-B6).

    ``arguments`` is the parsed JSON object the model produced for the call;
    ``id`` correlates the eventual tool result back to this call (OpenAI's
    ``tool_call_id``). The reasoning engine — not the provider — decides how to
    run the tool, keeping the provider layer agnostic.

    ``thought_signature`` is an OPAQUE, provider-specific continuation token
    (Gemini attaches one to each function-call part of a thinking model and
    REQUIRES it echoed back verbatim when the call is replayed in history — see
    https://ai.google.dev/gemini-api/docs/thought-signatures). Other providers
    leave it ``None``; the reasoning engine round-trips it untouched.
    """

    id: str
    name: str
    arguments: dict[str, Any]
    thought_signature: bytes | None = None


@dataclass(frozen=True)
class TextChunk:
    """A streamed text delta yielded by :meth:`AIProvider.stream_tools`."""

    text: str


# What ``stream_tools`` yields: either free text or a request to call a tool.
StreamEvent = TextChunk | ToolCallRequest


@dataclass(frozen=True)
class ProviderMessage:
    """One chat turn at the provider layer.

    Deliberately minimal (``role``/``content``) so the provider layer never
    depends on a business schema (see ``.ai/PHASE_4_PLAN.md`` decision #5).
    ``role`` is a bare ``str`` (``"system"``/``"user"``/``"assistant"``/
    ``"tool"``); each provider maps it to its own vendor vocabulary.

    The two tool-aware fields default to ``None`` so every existing positional
    ``ProviderMessage("system", "..")`` call site is unchanged (P7-B6):
    ``tool_calls`` carries an assistant turn's tool-call requests; a
    ``"tool"`` turn carries the result of one call keyed by ``tool_call_id``.
    """

    role: str
    content: str
    tool_call_id: str | None = None
    tool_calls: list[ToolCallRequest] | None = None


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

    async def embed(
        self,
        texts: list[str],
        *,
        model: str | None = None,
        dimensions: int | None = None,
        timeout: float | None = None,
    ) -> list[list[float]]:
        """Return one embedding vector per input text, in the SAME order.

        Provider-agnostic (Phase 9): the caller selects the embedding model and,
        when the model supports it (Matryoshka / OpenAI ``dimensions``), the
        target output ``dimensions`` so vectors match the storage column. A
        concrete default (not ``@abstractmethod``) mirrors ``stream`` so
        pre-existing subclasses/fakes stay instantiable; embedding-capable
        providers override it.
        """
        # ponytail: default raises rather than being abstract to keep existing
        # AIProvider subclasses instantiable; every embedding provider overrides.
        raise NotImplementedError("Embeddings are not implemented for this provider.")

    @abstractmethod
    async def health_check(self) -> bool:
        """Return ``True`` when the provider is reachable and configured."""

    async def stream(
        self,
        *,
        messages: list[ProviderMessage],
        model: str | None = None,
        temperature: float = 0.0,
        max_tokens: int | None = None,
        timeout: float | None = None,
    ) -> AsyncIterator[str]:
        """Yield text deltas for a chat ``messages`` history.

        Operates on role-bearing messages, never a flattened string (decision
        #5). A concrete default (not ``@abstractmethod``) mirrors
        ``generate_structured`` so pre-existing subclasses/fakes stay
        instantiable; real providers override it.
        """
        # ponytail: default raises rather than being abstract to keep existing
        # AIProvider subclasses instantiable; every streaming provider overrides
        # this. The unreachable ``yield`` makes this an async generator so the
        # return type is ``AsyncIterator[str]`` (not a coroutine).
        raise NotImplementedError("Streaming is not implemented for this provider.")
        yield ""  # pragma: no cover

    async def stream_tools(
        self,
        *,
        messages: list[ProviderMessage],
        tools: list[dict[str, Any]],
        model: str | None = None,
        temperature: float = 0.0,
        max_tokens: int | None = None,
        timeout: float | None = None,
    ) -> AsyncIterator[StreamEvent]:
        """Stream a turn where the model may request tool calls (P7-B6).

        ``tools`` is a list of JSON-schema tool specs in OpenAI "function" form
        (``{"type": "function", "function": {"name", "description",
        "parameters"}}``) — the shape ``ToolRegistry.list_specs()`` maps to.
        Yields :class:`TextChunk` for content and :class:`ToolCallRequest` for
        each completed tool call, keeping the reasoning engine provider-agnostic.

        A concrete default (not ``@abstractmethod``) mirrors ``stream`` so
        pre-existing subclasses/fakes stay instantiable; tool-calling providers
        override it.
        """
        # ponytail: default raises rather than being abstract so subclasses opt
        # in; the unreachable ``yield`` makes this an async generator so the
        # return type is ``AsyncIterator[StreamEvent]`` (not a coroutine).
        raise NotImplementedError("Tool calling is not implemented for this provider.")
        yield TextChunk("")  # pragma: no cover
