"""Chat context builder (structured, payload mode) — P4-B5 (v1.2-1).

Unlike single-shot features, chat keeps its context *structured* all the way
to the final render step. This builder holds the conversation ``messages`` and
a ``ConversationContext`` and does NOT flatten either into a prompt string —
that is the job of ``PromptManager.render_system_prompt(context)`` at the
render step (``.ai/PHASE_4_PLAN.md`` P4-B5). It never truncates; length limits
are the sole responsibility of ``AIBaseService`` (P3-B4).

Credential-like keys in the context sections are dropped via ``redact()``
before context leaves the app (``.ai/AI_ARCHITECTURE.md`` §13).
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from app.ai.context.base import ContextBuilder
from app.ai.schemas.chat_schema import ConversationContext

if TYPE_CHECKING:
    from app.ai.schemas.chat_schema import ChatMessage, ChatRequest


class ChatContext(ContextBuilder):
    """Structured context for the AI chat feature."""

    def __init__(
        self,
        *,
        messages: list[ChatMessage],
        context: ConversationContext | None = None,
    ) -> None:
        self.messages = messages
        # Redact credential-like keys from the present sections, then rebuild a
        # ConversationContext so downstream stays typed. Never None so the
        # render step can rely on a concrete object.
        present: dict[str, Any] = (context or ConversationContext()).model_dump(
            exclude_none=True
        )
        self.conversation_context = ConversationContext(**self.redact(present))

    @classmethod
    def from_payload(cls, req: ChatRequest) -> ChatContext:
        """Factory: build from a ChatRequest payload."""
        return cls(messages=req.messages, context=req.context)

    def build(self) -> dict[str, str]:
        # ponytail: minimal by design — the system prompt is rendered later by
        # PromptManager from the structured context, not flattened here.
        return {}

    def metadata(self) -> dict[str, Any]:
        """Non-sensitive counts."""
        sections = self.conversation_context.model_dump(exclude_none=True)
        return {
            "message_count": len(self.messages),
            "context_sections": len(sections),
        }

    def estimated_tokens(self) -> int:
        # ponytail: rough ~4 chars/token heuristic (English prose average).
        # Upgrade path: swap for a real tokenizer if cost precision matters.
        message_chars = sum(len(m.content) for m in self.messages)
        section_chars = sum(
            len(v)
            for v in self.conversation_context.model_dump(exclude_none=True).values()
        )
        return message_chars // 4 + section_chars // 4
