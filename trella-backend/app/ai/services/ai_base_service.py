"""AI base service.

Orchestrates PromptManager + provider for every AI feature. Renders a
server-side prompt template, calls the provider, measures latency, logs
metadata, and returns a structured :class:`AIResponse`. Unified errors from the
provider propagate unchanged so the router can map them to HTTP.
"""

from __future__ import annotations

import time
from collections.abc import AsyncIterator

from app.ai.prompts.prompt_manager import PromptManager
from app.ai.providers.base import AIProvider, ProviderMessage, T
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

    def _char_limit(self, model: str | None) -> int:
        """Resolve the char limit for ``model`` from settings.

        A per-model override in ``AI_MODEL_MAX_PROMPT_CHARS`` wins, else the
        global ``AI_MAX_PROMPT_CHARS``. Shared by ``_truncate`` (single prompt)
        and ``_truncate_messages`` (chat history) so both use one policy.
        """
        return settings.AI_MODEL_MAX_PROMPT_CHARS.get(
            model or "", settings.AI_MAX_PROMPT_CHARS
        )

    def _truncate(self, prompt: str, model: str | None) -> str:
        """Cap the rendered prompt to the resolved model's char limit.

        Limit is config-driven (see :meth:`_char_limit`). ContextBuilder stays
        limit-free; the cap is applied here, after the effective model is known
        and before the provider is called.

        ponytail: naive char-based truncation (~4 chars/token) that keeps the
        head and appends a marker. Upgrade path is chunking/RAG so the tail
        isn't silently dropped.
        """
        limit = self._char_limit(model)
        if len(prompt) <= limit:
            return prompt
        head = max(limit - len(_TRUNCATION_MARKER), 0)
        return prompt[:head] + _TRUNCATION_MARKER

    def _truncate_messages(
        self, messages: list[ProviderMessage], model: str | None
    ) -> list[ProviderMessage]:
        """Smart-trim a chat history to the resolved model's char limit.

        When total content chars exceed the limit, ALWAYS keep the system
        message (index 0), the latest user message, and the latest assistant
        message; drop the MIDDLE messages oldest-first until under the limit
        (decision #10 / v1.2-2). This preserves conversational grounding far
        better than a head/tail character cut.

        ponytail: char-based estimate (~4 chars/token), not a real tokenizer;
        upgrade path is token-exact counting + RAG so nothing is silently
        dropped.
        """
        limit = self._char_limit(model)

        def total(msgs: list[ProviderMessage]) -> int:
            return sum(len(m.content) for m in msgs)

        if total(messages) <= limit:
            return messages

        # Indices that must never be dropped: system (0) + latest user +
        # latest assistant. dict preserves insertion order and dedupes.
        keep: dict[int, None] = {}
        if messages:
            keep[0] = None
        for role in ("user", "assistant"):
            for i in range(len(messages) - 1, -1, -1):
                if messages[i].role == role:
                    keep[i] = None
                    break

        # Middle = everything not pinned, oldest-first (natural index order).
        droppable = [i for i in range(len(messages)) if i not in keep]
        dropped: set[int] = set()
        for i in droppable:
            if total([m for j, m in enumerate(messages) if j not in dropped]) <= limit:
                break
            dropped.add(i)

        return [m for j, m in enumerate(messages) if j not in dropped]

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

    async def run_stream(
        self,
        *,
        system_message: str,
        messages: list[ProviderMessage],
        model: str | None = None,
        feature: str = "",
        temperature: float = 0.0,
        max_tokens: int | None = None,
        timeout: float | None = None,
        prompt_version: str = "",
    ) -> AsyncIterator[str]:
        """Stream text deltas for a chat history.

        Prepends the already-rendered ``system_message`` to ``messages``,
        applies smart truncation (:meth:`_truncate_messages`), then relays the
        provider's delta stream. Stays generic: no feature registry or business
        schema is imported here. Callers pass a rendered system prompt + history.
        """
        full = [ProviderMessage("system", system_message), *messages]
        truncated = self._truncate_messages(full, model)
        model_name = model or "default"
        emit_event(
            "AI_REQUEST_STARTED",
            feature=feature,
            provider=self._provider.name,
        )
        started = time.perf_counter()
        try:
            async for delta in self._provider.stream(
                messages=truncated,
                model=model,
                temperature=temperature,
                max_tokens=max_tokens,
                timeout=timeout,
            ):
                yield delta
        except Exception:
            log_ai_call(
                feature=feature,
                provider=self._provider.name,
                model=model_name,
                latency_ms=int((time.perf_counter() - started) * 1000),
                prompt_version=prompt_version,
                ok=False,
            )
            emit_event(
                "AI_REQUEST_FAILED",
                feature=feature,
                provider=self._provider.name,
            )
            raise

        # Streaming yields no usage totals, so token counts are omitted here.
        log_ai_call(
            feature=feature,
            provider=self._provider.name,
            model=model_name,
            latency_ms=int((time.perf_counter() - started) * 1000),
            prompt_version=prompt_version,
        )
        emit_event(
            "AI_REQUEST_SUCCESS",
            feature=feature,
            provider=self._provider.name,
            model=model_name,
        )
