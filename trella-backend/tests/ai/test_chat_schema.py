"""P4-B2 check: chat schemas round-trip camelCase; structured optional context."""

from datetime import datetime, timezone

from app.ai.schemas.chat_schema import (
    ChatMessage,
    ChatRequest,
    ConversationContext,
)


def test_chat_message_serializes_camel_case() -> None:
    msg = ChatMessage(
        id="m1",
        timestamp=datetime(2024, 1, 1, tzinfo=timezone.utc),
        role="assistant",
        content="hello",
    )
    dumped = msg.model_dump(by_alias=True)
    assert dumped["id"] == "m1"
    assert dumped["timestamp"] == datetime(2024, 1, 1, tzinfo=timezone.utc)
    assert dumped["role"] == "assistant"
    assert dumped["content"] == "hello"


def test_chat_message_accepts_tool_role() -> None:
    msg = ChatMessage(
        id="m2",
        timestamp=datetime(2024, 1, 1, tzinfo=timezone.utc),
        role="tool",
        content="result",
    )
    assert msg.role == "tool"


def test_conversation_context_omits_absent_sections() -> None:
    ctx = ConversationContext(workspace="ws", sprint="sp")
    dumped = ctx.model_dump(by_alias=True, exclude_none=True)
    assert dumped == {"workspace": "ws", "sprint": "sp"}


def test_conversation_context_defaults_all_none() -> None:
    ctx = ConversationContext()
    assert ctx.workspace is None
    assert ctx.project is None
    assert ctx.sprint is None
    assert ctx.task is None
    assert ctx.knowledge is None


def test_chat_request_parses_messages_and_context() -> None:
    req = ChatRequest.model_validate(
        {
            "messages": [
                {
                    "id": "m1",
                    "timestamp": "2024-01-01T00:00:00Z",
                    "role": "user",
                    "content": "hi",
                }
            ],
            "context": {"workspace": "ws"},
        }
    )
    assert len(req.messages) == 1
    assert req.messages[0].role == "user"
    assert req.context is not None
    assert req.context.workspace == "ws"


def test_chat_request_defaults_to_empty_messages() -> None:
    req = ChatRequest()
    assert req.messages == []
    assert req.context is None
    # not a shared mutable default
    other = ChatRequest()
    req.messages.append(
        ChatMessage(
            id="x",
            timestamp=datetime(2024, 1, 1, tzinfo=timezone.utc),
            role="user",
            content="c",
        )
    )
    assert other.messages == []
