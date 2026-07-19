"""OpenAI implementation of :class:`AIProvider`.

Wraps the official async SDK, translates SDK failures into unified AI errors,
and owns retry/timeout via ``tenacity`` (so retry behavior is identical across
future providers rather than relying on each SDK's own retry logic).
"""

from __future__ import annotations

import json
from collections.abc import AsyncIterator
from typing import Any, cast

import openai
from openai import AsyncOpenAI
from openai.types.chat import ChatCompletionMessageParam
from tenacity import (
    retry as tenacity_retry,
)
from tenacity import (
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from app.ai.providers.base import (
    AIProvider,
    GenerationResult,
    ProviderMessage,
    StreamEvent,
    StructuredResult,
    T,
    TextChunk,
    ToolCallRequest,
)
from app.ai.utils.errors import (
    InvalidResponse,
    ProviderTimeout,
    ProviderUnavailable,
    RateLimited,
)

# Errors worth retrying: transient upstream conditions only.
_TRANSIENT = (ProviderTimeout, RateLimited)


class OpenAIProvider(AIProvider):
    name = "openai"

    def __init__(
        self,
        *,
        api_key: str | None,
        default_model: str,
        timeout: float,
        max_retries: int = 3,
        client: AsyncOpenAI | None = None,
    ) -> None:
        self._api_key = api_key
        self._default_model = default_model
        self._timeout = timeout
        self._max_retries = max(1, max_retries)
        # Client is created lazily so the app boots without a key (the health
        # endpoint reports unhealthy until one is set). ``client`` is
        # injectable for tests.
        self._client = client

    def _get_client(self) -> AsyncOpenAI:
        if self._client is None:
            if not self._api_key:
                raise ProviderUnavailable("OPENAI_API_KEY is not configured.")
            # max_retries=0: we own retries via tenacity for uniform behavior.
            self._client = AsyncOpenAI(
                api_key=self._api_key, timeout=self._timeout, max_retries=0
            )
        return self._client

    async def generate(
        self,
        *,
        prompt: str,
        model: str | None = None,
        temperature: float = 0.0,
        max_tokens: int | None = None,
        timeout: float | None = None,
    ) -> GenerationResult:
        target_model = model or self._default_model
        # Resolve the client up front so a missing-key config error is raised
        # immediately rather than being retried as if it were transient.
        client = self._get_client()

        @tenacity_retry(
            retry=retry_if_exception_type(_TRANSIENT),
            wait=wait_exponential(multiplier=0.5, max=8),
            stop=stop_after_attempt(self._max_retries),
            reraise=True,
        )
        async def _run() -> GenerationResult:
            return await self._complete(
                client, target_model, prompt, temperature, max_tokens, timeout
            )

        return await _run()

    async def _complete(
        self,
        client: AsyncOpenAI,
        model: str,
        prompt: str,
        temperature: float,
        max_tokens: int | None,
        timeout: float | None,
    ) -> GenerationResult:
        messages: list[ChatCompletionMessageParam] = [
            {"role": "user", "content": prompt}
        ]
        try:
            resp = await client.chat.completions.create(
                model=model,
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens,
                timeout=timeout or self._timeout,
            )
        except openai.APITimeoutError as exc:
            raise ProviderTimeout(str(exc))
        except openai.RateLimitError as exc:
            raise RateLimited(str(exc))
        except openai.OpenAIError as exc:
            # Auth, connection, 5xx, bad request -> single unavailable class.
            raise ProviderUnavailable(str(exc))

        content = resp.choices[0].message.content or ""
        usage = resp.usage
        return GenerationResult(
            content=content,
            model=model,
            provider=self.name,
            prompt_tokens=usage.prompt_tokens if usage else None,
            completion_tokens=usage.completion_tokens if usage else None,
        )

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
        target_model = model or self._default_model
        # Resolve the client up front so a missing-key config error is raised
        # immediately rather than being retried as if it were transient.
        client = self._get_client()

        @tenacity_retry(
            retry=retry_if_exception_type(_TRANSIENT),
            wait=wait_exponential(multiplier=0.5, max=8),
            stop=stop_after_attempt(self._max_retries),
            reraise=True,
        )
        async def _run() -> StructuredResult[T]:
            return await self._parse(
                client,
                target_model,
                prompt,
                response_model,
                temperature,
                max_tokens,
                timeout,
            )

        return await _run()

    async def _parse(
        self,
        client: AsyncOpenAI,
        model: str,
        prompt: str,
        response_model: type[T],
        temperature: float,
        max_tokens: int | None,
        timeout: float | None,
    ) -> StructuredResult[T]:
        messages: list[ChatCompletionMessageParam] = [
            {"role": "user", "content": prompt}
        ]
        try:
            resp = await client.beta.chat.completions.parse(
                model=model,
                messages=messages,
                response_format=response_model,
                temperature=temperature,
                max_tokens=max_tokens,
                timeout=timeout or self._timeout,
            )
        except openai.APITimeoutError as exc:
            raise ProviderTimeout(str(exc))
        except openai.RateLimitError as exc:
            raise RateLimited(str(exc))
        except openai.OpenAIError as exc:
            # Auth, connection, 5xx, bad request -> single unavailable class.
            raise ProviderUnavailable(str(exc))

        message = resp.choices[0].message
        parsed = message.parsed
        if parsed is None:
            # Model refused or returned no schema-conformant output. ``refusal``
            # carries the reason when present; content is never surfaced.
            raise InvalidResponse(message.refusal or "Model returned no parsed output.")

        usage = resp.usage
        return StructuredResult(
            parsed=parsed,
            model=model,
            provider=self.name,
            prompt_tokens=usage.prompt_tokens if usage else None,
            completion_tokens=usage.completion_tokens if usage else None,
            total_tokens=usage.total_tokens if usage else None,
        )

    async def embed(
        self,
        texts: list[str],
        *,
        model: str | None = None,
        dimensions: int | None = None,
        timeout: float | None = None,
    ) -> list[list[float]]:
        if not texts:
            return []
        target_model = model or self._default_model
        client = self._get_client()
        # Only pass ``dimensions`` when requested (older models reject it).
        extra: dict[str, Any] = {"dimensions": dimensions} if dimensions else {}

        @tenacity_retry(
            retry=retry_if_exception_type(_TRANSIENT),
            wait=wait_exponential(multiplier=0.5, max=8),
            stop=stop_after_attempt(self._max_retries),
            reraise=True,
        )
        async def _run() -> list[list[float]]:
            try:
                resp = await client.embeddings.create(
                    model=target_model,
                    input=texts,
                    timeout=timeout or self._timeout,
                    **extra,
                )
            except openai.APITimeoutError as exc:
                raise ProviderTimeout(str(exc))
            except openai.RateLimitError as exc:
                raise RateLimited(str(exc))
            except openai.OpenAIError as exc:
                raise ProviderUnavailable(str(exc))
            # ``data`` is returned in input order per the OpenAI API contract.
            return [list(item.embedding) for item in resp.data]

        return await _run()

    async def stream(
        self,
        *,
        messages: list[ProviderMessage],
        model: str | None = None,
        temperature: float = 0.0,
        max_tokens: int | None = None,
        timeout: float | None = None,
    ) -> AsyncIterator[str]:
        target_model = model or self._default_model
        client = self._get_client()
        # role is a bare str at the provider layer; the SDK's message params are
        # Literal-typed TypedDicts, so cast rather than branch on every role.
        sdk_messages = cast(
            "list[ChatCompletionMessageParam]",
            [{"role": m.role, "content": m.content} for m in messages],
        )
        # ponytail: no tenacity here — a retry that replays a partially consumed
        # stream would duplicate deltas. Errors (at init or mid-stream) are only
        # mapped to unified types. Upgrade path: retry solely at initiation.
        try:
            stream = await client.chat.completions.create(
                model=target_model,
                messages=sdk_messages,
                temperature=temperature,
                max_tokens=max_tokens,
                timeout=timeout or self._timeout,
                stream=True,
                stream_options={"include_usage": True},
            )
            async for chunk in stream:
                if not chunk.choices:
                    continue  # usage-only final chunk has no choices
                delta = chunk.choices[0].delta.content
                if delta:
                    yield delta
        except openai.APITimeoutError as exc:
            raise ProviderTimeout(str(exc))
        except openai.RateLimitError as exc:
            raise RateLimited(str(exc))
        except openai.OpenAIError as exc:
            raise ProviderUnavailable(str(exc))

    @staticmethod
    def _to_sdk_message(m: ProviderMessage) -> ChatCompletionMessageParam:
        """Map a tool-aware ``ProviderMessage`` to an OpenAI message dict.

        Assistant turns carry ``tool_calls`` (arguments re-serialized to the
        JSON string the API expects); a ``"tool"`` turn carries one call's
        result keyed by ``tool_call_id``. Plain turns stay ``role``/``content``.
        """
        if m.role == "tool":
            return cast(
                "ChatCompletionMessageParam",
                {
                    "role": "tool",
                    "tool_call_id": m.tool_call_id,
                    "content": m.content,
                },
            )
        if m.tool_calls:
            return cast(
                "ChatCompletionMessageParam",
                {
                    "role": "assistant",
                    "content": m.content or None,
                    "tool_calls": [
                        {
                            "id": tc.id,
                            "type": "function",
                            "function": {
                                "name": tc.name,
                                "arguments": json.dumps(tc.arguments),
                            },
                        }
                        for tc in m.tool_calls
                    ],
                },
            )
        return cast(
            "ChatCompletionMessageParam", {"role": m.role, "content": m.content}
        )

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
        target_model = model or self._default_model
        client = self._get_client()
        sdk_messages = [self._to_sdk_message(m) for m in messages]
        # Accumulate streamed tool-call deltas by index: id/name arrive once,
        # arguments as a JSON-string fragment stream. Flush a completed call
        # before any following text (and again at stream end) so the reasoning
        # engine sees calls in order.
        pending: dict[int, dict[str, str]] = {}

        def _drain() -> list[ToolCallRequest]:
            calls = [
                ToolCallRequest(
                    id=slot["id"],
                    name=slot["name"],
                    # An argument-less call streams "" — treat as empty object.
                    arguments=json.loads(slot["args"] or "{}"),
                )
                for _idx, slot in sorted(pending.items())
            ]
            pending.clear()
            return calls

        # ponytail: no tenacity — replaying a partially consumed stream would
        # duplicate deltas; we only map errors to unified types (like stream()).
        try:
            stream = await client.chat.completions.create(
                model=target_model,
                messages=sdk_messages,
                tools=cast("Any", tools),
                temperature=temperature,
                max_tokens=max_tokens,
                timeout=timeout or self._timeout,
                stream=True,
                stream_options={"include_usage": True},
            )
            async for chunk in stream:
                if not chunk.choices:
                    continue  # usage-only final chunk has no choices
                choice = chunk.choices[0]
                delta = choice.delta
                for tc in delta.tool_calls or []:
                    slot = pending.setdefault(
                        tc.index, {"id": "", "name": "", "args": ""}
                    )
                    if tc.id:
                        slot["id"] = tc.id
                    if tc.function:
                        if tc.function.name:
                            slot["name"] = tc.function.name
                        if tc.function.arguments:
                            slot["args"] += tc.function.arguments
                if delta.content:
                    for call in _drain():
                        yield call
                    yield TextChunk(delta.content)
                if choice.finish_reason is not None:
                    for call in _drain():
                        yield call
        except openai.APITimeoutError as exc:
            raise ProviderTimeout(str(exc))
        except openai.RateLimitError as exc:
            raise RateLimited(str(exc))
        except openai.OpenAIError as exc:
            raise ProviderUnavailable(str(exc))

    async def health_check(self) -> bool:
        if self._client is None and not self._api_key:
            return False
        try:
            await self._get_client().models.list()
        except openai.OpenAIError:
            return False
        return True
