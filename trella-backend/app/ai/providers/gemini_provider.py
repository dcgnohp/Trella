"""Google Gemini implementation of :class:`AIProvider`.

Wraps the official ``google-genai`` async SDK, translates its failures into the
unified AI errors, and owns retry/timeout via ``tenacity`` (identical policy to
the OpenAI provider). Structured output uses Gemini's native JSON schema mode
(``response_mime_type`` + ``response_schema``).
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Any, cast

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
_RATE_LIMIT_CODE = 429

# Gemini function-declaration schema = a strict OpenAPI 3.0 subset. Only these
# keywords are kept per node; everything else (default, title, $schema, $defs,
# additionalProperties, exclusiveMinimum/Maximum, pattern, minLength, …) is
# dropped, since Gemini 400s the whole request on an unsupported keyword.
_ALLOWED_SCHEMA_KEYS = frozenset(
    {
        "type",
        "description",
        "nullable",
        "enum",
        "items",
        "properties",
        "required",
        "minimum",
        "maximum",
        "minItems",
        "maxItems",
        "anyOf",
        "oneOf",
        "allOf",
    }
)
# ``format`` is allowed only for these Gemini-supported values (e.g. "uri" is NOT).
_ALLOWED_FORMATS = frozenset({"date-time", "date", "time", "enum", "int32", "int64"})


def _sanitize_gemini_schema(schema: Any) -> Any:
    """Recursively strip JSON-Schema keywords Gemini's function-calling rejects.

    Keeps only the supported OpenAPI-subset keywords (see ``_ALLOWED_SCHEMA_KEYS``)
    and drops an unsupported ``format`` (e.g. ``"uri"``). Non-dict inputs pass
    through unchanged. This makes rich external schemas (MCP tools) safe to send
    without failing the whole request. Provider-scoped: OpenAI accepts the raw
    schema, so only Gemini sanitizes.
    """
    if isinstance(schema, list):
        return [_sanitize_gemini_schema(item) for item in schema]
    if not isinstance(schema, dict):
        return schema
    out: dict[str, Any] = {}
    for key, value in schema.items():
        if key == "format":
            if isinstance(value, str) and value in _ALLOWED_FORMATS:
                out[key] = value
            continue
        if key not in _ALLOWED_SCHEMA_KEYS:
            continue
        if key == "properties" and isinstance(value, dict):
            out[key] = {k: _sanitize_gemini_schema(v) for k, v in value.items()}
        elif key in ("items", "anyOf", "oneOf", "allOf"):
            out[key] = _sanitize_gemini_schema(value)
        else:
            out[key] = value
    return out


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
                        http_options=types.HttpOptions(
                            timeout=int((timeout or self._timeout) * 1000)
                        ),
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
                        http_options=types.HttpOptions(
                            timeout=int((timeout or self._timeout) * 1000)
                        ),
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

        @tenacity_retry(
            retry=retry_if_exception_type(_TRANSIENT),
            wait=wait_exponential(multiplier=0.5, max=8),
            stop=stop_after_attempt(self._max_retries),
            reraise=True,
        )
        async def _run() -> list[list[float]]:
            try:
                resp = await client.aio.models.embed_content(
                    model=target_model,
                    contents=cast("Any", texts),
                    config=types.EmbedContentConfig(
                        # Matryoshka truncation when the model supports it, so the
                        # vector matches the storage column (and stays within the
                        # pgvector HNSW index limit). Cosine ordering is unaffected.
                        output_dimensionality=dimensions,
                        http_options=types.HttpOptions(
                            timeout=int((timeout or self._timeout) * 1000)
                        ),
                    ),
                )
            except Exception as exc:
                raise self._translate(exc)
            # ``embeddings`` is returned in input order (one per content).
            return [list(e.values or []) for e in (resp.embeddings or [])]

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
        # Gemini has no "system" turn: system messages become system_instruction
        # and the rest become contents (assistant -> Gemini's "model" role).
        system_parts = [m.content for m in messages if m.role == "system"]
        system_instruction = "\n".join(system_parts) or None
        contents = [
            types.Content(
                role="model" if m.role == "assistant" else "user",
                parts=[types.Part(text=m.content)],
            )
            for m in messages
            if m.role != "system"
        ]
        # ponytail: no tenacity here — replaying a partially consumed stream
        # would duplicate deltas; we only map errors to unified types.
        try:
            stream = await client.aio.models.generate_content_stream(
                model=target_model,
                contents=contents,
                config=types.GenerateContentConfig(
                    system_instruction=system_instruction,
                    temperature=temperature,
                    max_output_tokens=max_tokens,
                    http_options=types.HttpOptions(
                        timeout=int((timeout or self._timeout) * 1000)
                    ),
                ),
            )
            async for chunk in stream:
                yield chunk.text or ""
        except Exception as exc:
            raise self._translate(exc)

    @staticmethod
    def _to_contents(messages: list[ProviderMessage]) -> list[types.Content]:
        """Map tool-aware messages to Gemini ``Content`` turns (non-system).

        Assistant tool calls become ``function_call`` parts (role ``"model"``);
        a ``"tool"`` turn becomes a ``function_response`` part (role ``"user"``,
        which Gemini expects for tool results). The tool name a response needs —
        which the ``"tool"`` turn itself lacks — is recovered from the assistant
        call that shares its ``tool_call_id``.
        """
        name_by_id = {tc.id: tc.name for m in messages for tc in (m.tool_calls or [])}
        contents: list[types.Content] = []
        for m in messages:
            if m.role == "system":
                continue
            if m.role == "tool":
                # ponytail: wrap the raw result string as {"result": ...}; the
                # tools produce text results, so a richer envelope isn't needed.
                contents.append(
                    types.Content(
                        role="user",
                        parts=[
                            types.Part(
                                function_response=types.FunctionResponse(
                                    name=name_by_id.get(m.tool_call_id or "", ""),
                                    response={"result": m.content},
                                )
                            )
                        ],
                    )
                )
                continue
            if m.tool_calls:
                # Echo Gemini's thought_signature back on each function-call part
                # — required for multi-step tool calling with thinking models.
                parts = [
                    types.Part(
                        function_call=types.FunctionCall(
                            id=tc.id, name=tc.name, args=tc.arguments
                        ),
                        thought_signature=tc.thought_signature,
                    )
                    for tc in m.tool_calls
                ]
                if m.content:
                    parts.insert(0, types.Part(text=m.content))
                contents.append(types.Content(role="model", parts=parts))
                continue
            contents.append(
                types.Content(
                    role="model" if m.role == "assistant" else "user",
                    parts=[types.Part(text=m.content)],
                )
            )
        return contents

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
        system_parts = [m.content for m in messages if m.role == "system"]
        system_instruction = "\n".join(system_parts) or None
        contents = self._to_contents(messages)
        # Map OpenAI-shape tool specs to Gemini function declarations. Gemini's
        # function-declaration schema is a STRICT OpenAPI subset — unlike OpenAI
        # it rejects keywords like ``default``/``title``/``exclusiveMinimum``/
        # ``format: "uri"`` (e.g. external MCP tool schemas carry these), failing
        # the WHOLE request with 400 INVALID_ARGUMENT. Sanitize each schema first.
        declarations = [
            types.FunctionDeclaration(
                name=spec["function"]["name"],
                description=spec["function"].get("description"),
                parameters_json_schema=_sanitize_gemini_schema(
                    spec["function"].get("parameters")
                ),
            )
            for spec in tools
        ]
        # ponytail: no tenacity — replaying a partially consumed stream would
        # duplicate events; we only map errors to unified types (like stream()).
        try:
            stream = await client.aio.models.generate_content_stream(
                model=target_model,
                contents=contents,
                config=types.GenerateContentConfig(
                    system_instruction=system_instruction,
                    temperature=temperature,
                    max_output_tokens=max_tokens,
                    tools=[types.Tool(function_declarations=declarations)],
                    # ponytail: disable "thinking" on the tool-calling path.
                    # Thinking models emit a per-call ``thought_signature`` that
                    # MUST be echoed back verbatim on replay; during STREAMING it
                    # is unreliably surfaced per-chunk, so Gemini rejects the next
                    # turn with 400 "missing thought_signature". Turning thinking
                    # off removes the requirement entirely — our Reasoning Engine
                    # already drives multi-step reasoning in its own loop. Ceiling:
                    # no internal chain-of-thought; upgrade path = keep thinking on
                    # and round-trip signatures once the SDK surfaces them reliably
                    # in streaming (ToolCallRequest already carries the field).
                    thinking_config=types.ThinkingConfig(thinking_budget=0),
                    http_options=types.HttpOptions(
                        timeout=int((timeout or self._timeout) * 1000)
                    ),
                ),
            )
            async for chunk in stream:
                candidates = chunk.candidates or []
                if not candidates:
                    continue
                content = candidates[0].content
                if content is None:
                    continue
                for part in content.parts or []:
                    fc = part.function_call
                    if fc is not None:
                        # Capture the part's thought_signature so it can be
                        # echoed back verbatim when this call is replayed in
                        # history (Gemini requires it for tools to keep working).
                        yield ToolCallRequest(
                            id=fc.id or "",
                            name=fc.name or "",
                            arguments=dict(fc.args or {}),
                            thought_signature=getattr(part, "thought_signature", None),
                        )
                        continue
                    if part.text:
                        yield TextChunk(part.text)
        except Exception as exc:
            raise self._translate(exc)

    async def health_check(self) -> bool:
        if self._client is None and not self._api_key:
            return False
        try:
            await self._get_client().aio.models.list()
        except Exception:
            return False
        return True
