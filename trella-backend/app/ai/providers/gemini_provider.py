"""Google Gemini implementation of :class:`AIProvider`.

Wraps the official ``google-genai`` async SDK, translates its failures into the
unified AI errors, and owns retry/timeout via ``tenacity`` (identical policy to
the OpenAI provider). Structured output uses Gemini's native JSON schema mode
(``response_mime_type`` + ``response_schema``).
"""

from __future__ import annotations

import httpx
from google import genai
from google.genai import errors, types
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
_RATE_LIMIT_CODE = 429


class GeminiProvider(AIProvider):
    name = "gemini"

    def __init__(
        self,
        *,
        api_key: str | None,
        default_model: str,
        timeout: float,
        max_retries: int = 3,
        client: genai.Client | None = None,
    ) -> None:
        self._api_key = api_key
        self._default_model = default_model
        self._timeout = timeout
        self._max_retries = max(1, max_retries)
        # Lazy client so the app boots without a key (health reports unhealthy
        # until one is set). ``client`` is injectable for tests.
        self._client = client

    def _get_client(self) -> genai.Client:
        if self._client is None:
            if not self._api_key:
                raise ProviderUnavailable("GEMINI_API_KEY is not configured.")
            self._client = genai.Client(
                api_key=self._api_key,
                # google-genai expresses the HTTP timeout in milliseconds.
                http_options=types.HttpOptions(timeout=int(self._timeout * 1000)),
            )
        return self._client

    @staticmethod
    def _translate(exc: Exception) -> Exception:
        """Map an SDK exception to a unified AI error (else return as-is)."""
        if isinstance(exc, httpx.TimeoutException):
            return ProviderTimeout(str(exc))
        if isinstance(exc, errors.APIError):
            if getattr(exc, "code", None) == _RATE_LIMIT_CODE:
                return RateLimited(str(exc))
            return ProviderUnavailable(str(exc))
        return exc

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
        client = self._get_client()

        @tenacity_retry(
            retry=retry_if_exception_type(_TRANSIENT),
            wait=wait_exponential(multiplier=0.5, max=8),
            stop=stop_after_attempt(self._max_retries),
            reraise=True,
        )
        async def _run() -> GenerationResult:
            try:
                resp = await client.aio.models.generate_content(
                    model=target_model,
                    contents=prompt,
                    config=types.GenerateContentConfig(
                        temperature=temperature,
                        max_output_tokens=max_tokens,
                        http_options=types.HttpOptions(timeout=int((timeout or self._timeout) * 1000)),
                    ),
                )
            except Exception as exc:
                raise self._translate(exc)
            usage = resp.usage_metadata
            return GenerationResult(
                content=resp.text or "",
                model=target_model,
                provider=self.name,
                prompt_tokens=usage.prompt_token_count if usage else None,
                completion_tokens=usage.candidates_token_count if usage else None,
                total_tokens=usage.total_token_count if usage else None,
            )

        return await _run()

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
        client = self._get_client()

        @tenacity_retry(
            retry=retry_if_exception_type(_TRANSIENT),
            wait=wait_exponential(multiplier=0.5, max=8),
            stop=stop_after_attempt(self._max_retries),
            reraise=True,
        )
        async def _run() -> StructuredResult[T]:
            try:
                resp = await client.aio.models.generate_content(
                    model=target_model,
                    contents=prompt,
                    config=types.GenerateContentConfig(
                        temperature=temperature,
                        max_output_tokens=max_tokens,
                        response_mime_type="application/json",
                        response_schema=response_model,
                        http_options=types.HttpOptions(timeout=int((timeout or self._timeout) * 1000)),
                    ),
                )
            except Exception as exc:
                raise self._translate(exc)

            # response_mime_type=json guarantees text is JSON; validate it into
            # the model (CamelModel accepts snake_case and camelCase aliases).
            text = resp.text
            if not text:
                raise InvalidResponse("Gemini returned no structured output.")
            parsed = response_model.model_validate_json(text)
            usage = resp.usage_metadata
            return StructuredResult(
                parsed=parsed,
                model=target_model,
                provider=self.name,
                prompt_tokens=usage.prompt_token_count if usage else None,
                completion_tokens=usage.candidates_token_count if usage else None,
                total_tokens=usage.total_token_count if usage else None,
            )

        return await _run()

    async def health_check(self) -> bool:
        if self._client is None and not self._api_key:
            return False
        try:
            await self._get_client().aio.models.list()
        except Exception:
            return False
        return True
