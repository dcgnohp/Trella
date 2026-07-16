"""P4-B7 checks: AIChatService relays deltas and renders a system prompt.

No network: a fake provider whose ``stream()`` is an async generator yielding
scripted deltas and recording the messages it received (mirrors
``test_base_stream.py``).
"""

import asyncio
from collections.abc import AsyncIterator
from datetime import datetime

import pytest

from app.ai.context.chat_context import ChatContext
from app.ai.providers.base import AIProvider, ProviderMessage
from app.ai.schemas.chat_schema import ChatMessage, ConversationContext
from app.ai.services.ai_base_service import AIBaseService
from app.ai.services.ai_chat_service import AIChatService
from app.ai.utils.errors import InvalidPrompt
from app.core.config import settings


class _FakeStreamProvider(AIProvider):
    name = "fake"

    def __init__(self, deltas: list[str] | None = None) -> None:
        self._deltas = deltas or []
        self.seen_messages: list[ProviderMessage] | None = None
        self.stream_called = False

    async def generate(  # type: ignore[override]
        self,
        *,
        prompt: str,
        model: str | None = None,
        temperature: float = 0.0,
        max_tokens: int | None = None,
        timeout: float | None = None,
    ):
        raise NotImplementedError

    async def health_check(self) -> bool:
        return True

    async def stream(
        self,
        *,
        messages: list[ProviderMessage],
        model: str | None = None,
        temperature: float = 0.0,
        max_tokens: int | None = None,
        timeout: float | None = None,
    ) -> AsyncIterator[str]:
        self.stream_called = True
        self.seen_messages = messages
        for delta in self._deltas:
            yield delta


def _msg(role: str, content: str) -> ChatMessage:
    return ChatMessage(
        id=f"{role}-1", timestamp=datetime(2024, 1, 1), role=role, content=content
    )


async def _collect(service: AIChatService, context: ChatContext) -> list[str]:
    return [d async for d in service.chat(context)]


def test_chat_yields_deltas_and_prepends_rendered_system_prompt() -> None:
    provider = _FakeStreamProvider(["Hel", "lo", "!"])
    base = AIBaseService(provider)
    service = AIChatService(base, settings)

    context = ChatContext(
        messages=[
            _msg("system", "IGNORED-INPUT-SYSTEM"),
            _msg("user", "hi"),
            _msg("assistant", "hey"),
        ],
        context=ConversationContext(project="Apollo"),
    )

    out = asyncio.run(_collect(service, context))

    assert out == ["Hel", "lo", "!"]
    seen = provider.seen_messages
    assert seen is not None
    # System message rendered server-side sits at index 0.
    assert seen[0].role == "system"
    # Rendered from the chat prompt + the provided context section.
    assert "Trella" in seen[0].content
    assert "Apollo" in seen[0].content
    # Input system-role message is excluded; user/assistant follow in order.
    assert seen[1:] == [
        ProviderMessage("user", "hi"),
        ProviderMessage("assistant", "hey"),
    ]


def test_chat_renders_all_context_sections_into_system_prompt() -> None:
    """Verification (Phase 4 completion): a populated ConversationContext from
    the frontend is rendered into the system prompt, section by section."""
    provider = _FakeStreamProvider(["ok"])
    service = AIChatService(AIBaseService(provider), settings)

    context = ChatContext(
        messages=[_msg("user", "Sprint hiện tại đang làm gì?")],
        context=ConversationContext(
            workspace="Name: Trella\nMode: SCRUM",
            project="Board: Backend",
            sprint="Name: Sprint 1.1\nStatus: ACTIVE",
            task="Title: task 4\nStatus: In Progress",
        ),
    )

    asyncio.run(_collect(service, context))

    system = provider.seen_messages[0].content  # type: ignore[index]
    assert "Workspace:" in system and "Trella" in system
    assert "Project:" in system and "Backend" in system
    assert "Sprint:" in system and "Sprint 1.1" in system
    assert "Task:" in system and "task 4" in system


def test_chat_empty_messages_raises_without_consuming_provider() -> None:
    provider = _FakeStreamProvider(["should-not-stream"])
    base = AIBaseService(provider)
    service = AIChatService(base, settings)

    context = ChatContext(messages=[])

    with pytest.raises(InvalidPrompt):
        service.chat(context)

    assert provider.stream_called is False
