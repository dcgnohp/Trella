"""AI Chat service.

Composes ``ChatContext`` + registry + ``AIBaseService`` for the ``CHAT``
feature. It imports no provider SDK and hardcodes no model or prompt;
truncation lives in ``AIBaseService``, not here.

Two paths:

* :meth:`chat` — the payload-only streaming path (Phase 4). Depends only on a
  ``ChatContext`` and never touches business data.
* :meth:`chat_with_tools` — the Phase 7 reasoning path. When ``AI_TOOLS_ENABLED``
  is set it delegates to a :class:`ReasoningEngine`, which reads live workspace
  data *only* through the isolated Workspace Data Access Layer (the reasoning
  engine and this service still never import a business service directly).
"""

from __future__ import annotations

from collections.abc import AsyncIterator

from app.ai.context.chat_context import ChatContext
from app.ai.prompts.prompt_manager import PromptManager
from app.ai.providers.base import ProviderMessage
from app.ai.reasoning.budget import ToolBudget
from app.ai.reasoning.engine import ReasoningEngine, ReasoningEvent
from app.ai.registry import AIFeature, get_feature_config, resolve_model
from app.ai.services.ai_base_service import AIBaseService
from app.ai.tools.base import ToolContext
from app.ai.tools.executor import ToolExecutor
from app.ai.tools.wiring import ensure_tools_registered, get_session_memory
from app.ai.utils.errors import InvalidPrompt
from app.core.config import Settings


class AIChatService:
    def __init__(self, base: AIBaseService, settings: Settings) -> None:
        self._base = base
        self._settings = settings
        self._prompts = PromptManager()
        # Built once per service instance only when tools are enabled. None
        # means the reasoning path is off and the router uses the plain stream.
        self._engine: ReasoningEngine | None = None
        if settings.AI_TOOLS_ENABLED:
            registry = ensure_tools_registered()
            config = get_feature_config(AIFeature.CHAT)
            # A multi-axis Tool Budget only applies when write is enabled (P8);
            # otherwise budget=None keeps the Phase 7 count-only loop behavior.
            budget = (
                ToolBudget(
                    max_tool_calls=settings.AI_AGENT_MAX_TOOL_CALLS,
                    max_iterations=settings.AI_AGENT_MAX_ITERATIONS,
                    max_latency_s=settings.AI_AGENT_MAX_LATENCY_S,
                    max_cost=settings.AI_AGENT_MAX_COST,
                )
                if settings.AI_AGENT_WRITE_ENABLED
                else None
            )
            self._engine = ReasoningEngine(
                base.provider,
                registry=registry,
                executor=ToolExecutor(registry, timeout_s=settings.AI_TOOL_TIMEOUT),
                memory=get_session_memory(),
                max_tool_calls=settings.AI_MAX_TOOL_CALLS,
                budget=budget,
                model=resolve_model(config.model_tier, settings),
                temperature=config.temperature,
                max_tokens=config.max_tokens,
                timeout=config.timeout,
            )

    @property
    def tools_enabled(self) -> bool:
        """Whether the reasoning/tools path is available on this instance."""
        return self._engine is not None

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

    def chat_with_tools(
        self,
        context: ChatContext,
        *,
        tool_ctx: ToolContext,
        conversation_id: str,
        current_view: dict[str, str] | None = None,
    ) -> AsyncIterator[ReasoningEvent]:
        """Run the reasoning loop, yielding normalized :data:`ReasoningEvent`s.

        Validates eagerly (empty conversation -> ``InvalidPrompt``) like
        :meth:`chat`. The rendered system prompt is augmented with the
        current-view IDs so the model can call scoped tools with real ids. Only
        callable when :attr:`tools_enabled`.
        """
        if self._engine is None:
            raise InvalidPrompt("Tool-calling is disabled.")
        if not context.messages:
            raise InvalidPrompt("Conversation has no messages.")

        system_message = self._prompts.render_system_prompt(
            context.conversation_context
        )
        system_message += "\n\n" + self._reasoning_guidance(current_view)

        provider_messages = [
            ProviderMessage(role=m.role, content=m.content)
            for m in context.messages
            if m.role != "system"
        ]
        return self._engine.run(
            system_message=system_message,
            messages=provider_messages,
            tool_ctx=tool_ctx,
            conversation_id=conversation_id,
        )

    def _reasoning_guidance(self, current_view: dict[str, str] | None) -> str:
        """Render the on-disk agent reasoning guidance (planner + tool selection
        + CoT suppression + reflection + topic-carryover rules).

        Prompt text lives on disk (``prompts/agent_reasoning.md``) per
        ``AI_ARCHITECTURE.md`` §5 — not hardcoded here. Only the dynamic
        current-view ids are injected as a variable. The ids are a DEFAULT scope;
        the conversation topic wins (see the prompt's rules).
        """
        lines = (
            "\n".join(f"- {key}: {value}" for key, value in current_view.items())
            if current_view
            else "- (none)"
        )
        return self._prompts.render("agent_reasoning", {"current_view": lines})
