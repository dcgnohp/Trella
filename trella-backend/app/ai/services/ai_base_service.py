"""AI base service.

Orchestrates PromptManager + provider for every AI feature. Renders a
server-side prompt template, calls the provider, measures latency, logs
metadata, and returns a structured :class:`AIResponse`. Unified errors from the
provider propagate unchanged so the router can map them to HTTP.
"""

from __future__ import annotations

import time

from app.ai.prompts.prompt_manager import PromptManager
from app.ai.providers.base import AIProvider, T
from app.ai.schemas.ai_schema import AIResponse
from app.ai.utils.logging import emit_event, log_ai_call
from app.core.config import settings

_TRUNCATION_MARKER = "\n... [truncated]"


class AIBaseService:
    def __init__(
        self,
        provider: AIProvider,
        prompt_manager: PromptManager | None = None,
    ) -> None:
        self._provider = provider
        self._prompts = prompt_manager or PromptManager()

    @property
    def provider_name(self) -> str:
        return self._provider.name

    async def health_check(self) -> bool:
        """Return whether the underlying provider is reachable/configured."""
        return await self._provider.health_check()

    def _truncate(self, prompt: str, model: str | None) -> str:
        """Cap the rendered prompt to the resolved model's char limit.

        Limit is config-driven: a per-model override in
        ``AI_MODEL_MAX_PROMPT_CHARS`` wins, else ``AI_MAX_PROMPT_CHARS``.
        ContextBuilder stays limit-free; the cap is applied here, after the
        effective model is known and before the provider is called.

        ponytail: naive char-based truncation (~4 chars/token) that keeps the
        head and appends a marker. Upgrade path is chunking/RAG so the tail
        isn't silently dropped.
        """
        limit = settings.AI_MODEL_MAX_PROMPT_CHARS.get(
            model or "", settings.AI_MAX_PROMPT_CHARS
        )
        if len(prompt) <= limit:
            return prompt
        head = max(limit - len(_TRUNCATION_MARKER), 0)
        return prompt[:head] + _TRUNCATION_MARKER

    async def run(
        self,
        *,
        prompt_name: str,
        variables: dict[str, str] | None = None,
        model: str | None = None,
        feature: str | None = None,
        temperature: float = 0.0,
        max_tokens: int | None = None,
        timeout: float | None = None,
    ) -> AIResponse:
        """Render ``prompt_name`` and generate a completion."""
        prompt = self._truncate(self._prompts.render(prompt_name, variables), model)
        feature_name = feature or prompt_name
        started = time.perf_counter()
        try:
            result = await self._provider.generate(
                prompt=prompt,
                model=model,
                temperature=temperature,
                max_tokens=max_tokens,
                timeout=timeout,
            )
        except Exception:
            log_ai_call(
                feature=feature_name,
                provider=self._provider.name,
                model=model or "default",
                latency_ms=int((time.perf_counter() - started) * 1000),
                ok=False,
            )
            raise

        latency_ms = int((time.perf_counter() - started) * 1000)
        log_ai_call(
            feature=feature_name,
            provider=result.provider,
            model=result.model,
            latency_ms=latency_ms,
            prompt_tokens=result.prompt_tokens,
            completion_tokens=result.completion_tokens,
        )
        return AIResponse(
            content=result.content,
            model=result.model,
            provider=result.provider,
            latency_ms=latency_ms,
        )

    async def run_structured(
        self,
        *,
        prompt_name: str,
        variables: dict[str, str],
        response_model: type[T],
        model: str | None = None,
        feature: str = "",
        temperature: float = 0.0,
        max_tokens: int | None = None,
        timeout: float | None = None,
        prompt_version: str = "",
        response_schema_version: str = "",
    ) -> T:
        """Render ``prompt_name`` and generate a schema-parsed model instance.

        Stays generic: no feature registry or business schema is imported here.
        Callers pass the concrete ``response_model``.
        """
        prompt = self._truncate(self._prompts.render(prompt_name, variables), model)
        feature_name = feature or prompt_name
        emit_event(
            "AI_REQUEST_STARTED",
            feature=feature_name,
            provider=self._provider.name,
        )
        started = time.perf_counter()
        try:
            result = await self._provider.generate_structured(
                prompt=prompt,
                response_model=response_model,
                model=model,
                temperature=temperature,
                max_tokens=max_tokens,
                timeout=timeout,
            )
        except Exception:
            log_ai_call(
                feature=feature_name,
                provider=self._provider.name,
                model=model or "default",
                latency_ms=int((time.perf_counter() - started) * 1000),
                prompt_version=prompt_version,
                response_model_version=response_schema_version,
                ok=False,
            )
            emit_event(
                "AI_REQUEST_FAILED",
                feature=feature_name,
                provider=self._provider.name,
            )
            raise

        latency_ms = int((time.perf_counter() - started) * 1000)
        log_ai_call(
            feature=feature_name,
            provider=result.provider,
            model=result.model,
            latency_ms=latency_ms,
            prompt_tokens=result.prompt_tokens,
            completion_tokens=result.completion_tokens,
            total_tokens=result.total_tokens,
            prompt_version=prompt_version,
            response_model_version=response_schema_version,
        )
        emit_event(
            "AI_REQUEST_SUCCESS",
            feature=feature_name,
            provider=result.provider,
            model=result.model,
        )
        return result.parsed
