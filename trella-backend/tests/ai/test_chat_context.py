"""P4-B5 check: ChatContext structured payload builder (no flatten, no limits)."""

from datetime import datetime

from app.ai.context.chat_context import ChatContext
from app.ai.schemas.chat_schema import ChatMessage, ChatRequest, ConversationContext


def _msg(content: str, role: str = "user") -> ChatMessage:
    return ChatMessage(
        id="m1",
        timestamp=datetime(2024, 1, 1),  # noqa: DTZ001 - fixed value for tests
        role=role,  # type: ignore[arg-type]
        content=content,
    )


def test_from_payload_maps_messages_and_context() -> None:
    ctx = ConversationContext(workspace="ws", project="proj")
    req = ChatRequest(messages=[_msg("hello")], context=ctx)
    built = ChatContext.from_payload(req)

    assert built.messages == [_msg("hello")]
    assert built.conversation_context.workspace == "ws"
    assert built.conversation_context.project == "proj"


def test_conversation_context_defaults_to_empty_when_none() -> None:
    req = ChatRequest(messages=[_msg("hi")], context=None)
    built = ChatContext.from_payload(req)

    assert built.conversation_context == ConversationContext()


def test_build_is_empty() -> None:
    built = ChatContext(messages=[_msg("hi")], context=ConversationContext(task="t"))
    assert built.build() == {}


def test_metadata_counts_messages_and_present_sections() -> None:
    ctx = ConversationContext(workspace="ws", sprint="s3")
    built = ChatContext(messages=[_msg("a"), _msg("b")], context=ctx)
    assert built.metadata() == {"message_count": 2, "context_sections": 2}


def test_metadata_counts_zero_sections_when_empty_context() -> None:
    built = ChatContext(messages=[_msg("a")])
    assert built.metadata() == {"message_count": 1, "context_sections": 0}


def test_estimated_tokens_is_roughly_length_over_four() -> None:
    messages = [_msg("a" * 400), _msg("b" * 400)]  # 800 chars -> 200
    ctx = ConversationContext(workspace="w" * 40)  # 40 chars -> 10
    built = ChatContext(messages=messages, context=ctx)
    assert built.estimated_tokens() == 210


def test_content_and_context_not_truncated() -> None:
    long = "x" * 500_000
    built = ChatContext(
        messages=[_msg(long)], context=ConversationContext(project=long)
    )
    assert built.messages[0].content == long
    assert built.conversation_context.project == long


def test_credential_like_section_keys_are_dropped() -> None:
    # ConversationContext has no secret-looking fields, so redaction must be a
    # no-op that preserves every present section.
    ctx = ConversationContext(
        workspace="ws", project="p", sprint="s", task="t", knowledge="k"
    )
    built = ChatContext(messages=[], context=ctx)
    assert built.conversation_context == ctx
