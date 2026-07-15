"""OpenAI implementation of :class:`AIProvider`.

Wraps the official async SDK, translates SDK failures into unified AI errors,
and owns retry/timeout via ``tenacity`` (so retry behavior is identical across
future providers rather than relying on each SDK's own retry logic).
"""

from __future__ import annotations

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

from app.ai.providers.base import AIProvider, GenerationResult, StructuredResult, T
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
                client, target_model, prompt, response_model, temperature, max_tokens, timeout
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

    async def health_check(self) -> bool:
        if self._client is None and not self._api_key:
            return False
        try:
            await self._get_client().models.list()
        except openai.OpenAIError:
            return False
        return True
