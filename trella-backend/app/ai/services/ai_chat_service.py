"""AI Chat service.

Composes ``ChatContext`` + registry + ``AIBaseService`` for the ``CHAT``
feature. Mirrors ``AIDocumentSummaryService``: it depends only on a
``ChatContext`` for input, never calls business services, imports no provider
SDK, and hardcodes no model or prompt. Truncation lives in ``AIBaseService``,
not here.
"""

from __future__ import annotations

from collections.abc import AsyncIterator

from app.ai.context.chat_context import ChatContext
from app.ai.prompts.prompt_manager import PromptManager
from app.ai.providers.base import ProviderMessage
from app.ai.registry import AIFeature, get_feature_config, resolve_model
from app.ai.services.ai_base_service import AIBaseService
from app.ai.utils.errors import InvalidPrompt
from app.core.config import Settings


class AIChatService:
    def __init__(self, base: AIBaseService, settings: Settings) -> None:
        self._base = base
        self._settings = settings
        self._prompts = PromptManager()

    def chat(self, context: ChatContext) -> AsyncIterator[str]:
        """Stream chat text deltas for a conversation history.

        Validates eagerly (before any iteration) so an empty conversation
        raises ``InvalidPrompt`` without touching the provider, then returns an
        async generator that relays the base service's delta stream.
        """
        if not context.messages:
            raise InvalidPrompt("Conversation has no messages.")

        system_message = self._prompts.render_system_prompt(
            context.conversation_context
        )
        # System-role messages from the input are excluded: the system prompt is
        # rendered server-side and prepended by AIBaseService.
        provider_messages = [
            ProviderMessage(role=m.role, content=m.content)
            for m in context.messages
            if m.role != "system"
        ]

        config = get_feature_config(AIFeature.CHAT)
        model = resolve_model(config.model_tier, self._settings)

        async def _stream() -> AsyncIterator[str]:
            async for delta in self._base.run_stream(
                system_message=system_message,
                messages=provider_messages,
                model=model,
                feature=AIFeature.CHAT.value,
                temperature=config.temperature,
                max_tokens=config.max_tokens,
                timeout=config.timeout,
                prompt_version=config.prompt_version,
            ):
                yield delta

        return _stream()
