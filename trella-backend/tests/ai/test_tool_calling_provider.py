"""P7-B6 checks: provider ``stream_tools`` surfaces tool calls + text.

No network: the vendor async clients are faked (mirrors ``test_streaming.py``)
and coroutines are driven with ``asyncio.run``. Each provider is fed a scripted
response containing a tool call followed by text and must yield a
``ToolCallRequest`` (with JSON arguments parsed to a dict) then a ``TextChunk``.
A quick ``stream()`` regression confirms the plain path is unchanged.
"""

import asyncio
from collections.abc import AsyncIterator, Iterable
from types import SimpleNamespace
from typing import Any

import pytest

from app.ai.providers.base import (
    ProviderMessage,
    StreamEvent,
    TextChunk,
    ToolCallRequest,
)
from app.ai.providers.gemini_provider import GeminiProvider
from app.ai.providers.openai_provider import OpenAIProvider

_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "get_weather",
            "description": "Look up the weather.",
            "parameters": {
                "type": "object",
                "properties": {"city": {"type": "string"}},
                "required": ["city"],
            },
        },
    }
]


async def _aiter(items: Iterable[Any]) -> AsyncIterator[Any]:
    for item in items:
        yield item


async def _collect(stream: AsyncIterator[StreamEvent]) -> list[StreamEvent]:
    return [event async for event in stream]


async def _collect_text(stream: AsyncIterator[str]) -> list[str]:
    return [delta async for delta in stream]


# --- OpenAI ---------------------------------------------------------------


def _oa_tool_delta(
    *, index: int, id: str | None, name: str | None, args: str | None
) -> Any:
    fn = SimpleNamespace(name=name, arguments=args)
    return SimpleNamespace(index=index, id=id, function=fn)


def _oa_chunk(
    *,
    content: str | None = None,
    tool_calls: list[Any] | None = None,
    finish_reason: str | None = None,
) -> Any:
    delta = SimpleNamespace(content=content, tool_calls=tool_calls)
    return SimpleNamespace(
        choices=[SimpleNamespace(delta=delta, finish_reason=finish_reason)]
    )


class _FakeOpenAICreate:
    def __init__(self, chunks: list[Any]) -> None:
        self._chunks = chunks
        self.kwargs: dict[str, Any] | None = None

    async def __call__(self, **kwargs: Any) -> Any:
        self.kwargs = kwargs
        return _aiter(self._chunks)


def _openai(create: _FakeOpenAICreate) -> OpenAIProvider:
    client = SimpleNamespace(
        chat=SimpleNamespace(completions=SimpleNamespace(create=create))
    )
    return OpenAIProvider(
        api_key="x", default_model="gpt-4.1-mini", timeout=5.0, client=client
    )


def test_openai_stream_tools_yields_tool_call_then_text() -> None:
    # Tool-call arguments stream as JSON-string fragments across two chunks,
    # then a content chunk arrives — the completed call must flush first.
    create = _FakeOpenAICreate(
        chunks=[
            _oa_chunk(
                tool_calls=[
                    _oa_tool_delta(
                        index=0, id="call_1", name="get_weather", args='{"city": '
                    )
                ]
            ),
            _oa_chunk(
                tool_calls=[
                    _oa_tool_delta(index=0, id=None, name=None, args='"Paris"}')
                ]
            ),
            _oa_chunk(content="It is sunny."),
            _oa_chunk(finish_reason="stop"),
        ]
    )
    provider = _openai(create)
    events = asyncio.run(
        _collect(
            provider.stream_tools(
                messages=[ProviderMessage("user", "weather in Paris?")],
                tools=_TOOLS,
            )
        )
    )
    assert events == [
        ToolCallRequest(id="call_1", name="get_weather", arguments={"city": "Paris"}),
        TextChunk("It is sunny."),
    ]
    assert create.kwargs is not None
    assert create.kwargs["tools"] == _TOOLS
    assert create.kwargs["stream"] is True


def test_openai_stream_tools_maps_tool_history_messages() -> None:
    # An assistant tool-call turn + a tool result turn must serialize to the
    # OpenAI message shapes (assistant.tool_calls + role="tool").
    create = _FakeOpenAICreate(chunks=[_oa_chunk(content="done", finish_reason="stop")])
    provider = _openai(create)
    messages = [
        ProviderMessage("user", "weather?"),
        ProviderMessage(
            role="assistant",
            content="",
            tool_calls=[
                ToolCallRequest(
                    id="call_1", name="get_weather", arguments={"city": "Paris"}
                )
            ],
        ),
        ProviderMessage(role="tool", content="sunny", tool_call_id="call_1"),
    ]
    asyncio.run(_collect(provider.stream_tools(messages=messages, tools=_TOOLS)))
    sent = create.kwargs["messages"]  # type: ignore[index]
    assert sent[0] == {"role": "user", "content": "weather?"}
    assert sent[1]["role"] == "assistant"
    assert sent[1]["tool_calls"][0]["id"] == "call_1"
    assert sent[1]["tool_calls"][0]["function"]["name"] == "get_weather"
    # arguments are re-serialized to the JSON string the API expects.
    assert sent[1]["tool_calls"][0]["function"]["arguments"] == '{"city": "Paris"}'
    assert sent[2] == {"role": "tool", "tool_call_id": "call_1", "content": "sunny"}


def test_openai_stream_regression_no_tools() -> None:
    # The plain stream() path is unchanged: content deltas, usage-only skipped.
    create = _FakeOpenAICreate(
        chunks=[
            _oa_chunk(content="Hel"),
            _oa_chunk(content="lo"),
            SimpleNamespace(choices=[]),  # usage-only tail
        ]
    )
    provider = _openai(create)
    deltas = asyncio.run(
        _collect_text(provider.stream(messages=[ProviderMessage("user", "hi")]))
    )
    assert deltas == ["Hel", "lo"]


# --- Gemini ---------------------------------------------------------------


def _gm_chunk(*, function_call: Any = None, text: str | None = None) -> Any:
    part = SimpleNamespace(function_call=function_call, text=text)
    content = SimpleNamespace(parts=[part])
    return SimpleNamespace(candidates=[SimpleNamespace(content=content)])


class _FakeGeminiStream:
    def __init__(self, chunks: list[Any]) -> None:
        self._chunks = chunks
        self.kwargs: dict[str, Any] | None = None

    async def __call__(self, **kwargs: Any) -> Any:
        self.kwargs = kwargs
        return _aiter(self._chunks)


def _gemini(stream: _FakeGeminiStream) -> GeminiProvider:
    client = SimpleNamespace(
        aio=SimpleNamespace(models=SimpleNamespace(generate_content_stream=stream))
    )
    return GeminiProvider(
        api_key="x", default_model="gemini-2.0-flash", timeout=5.0, client=client
    )


def test_gemini_stream_tools_yields_tool_call_then_text() -> None:
    stream = _FakeGeminiStream(
        chunks=[
            _gm_chunk(
                function_call=SimpleNamespace(
                    id="call_1", name="get_weather", args={"city": "Paris"}
                )
            ),
            _gm_chunk(text="It is sunny."),
        ]
    )
    provider = _gemini(stream)
    events = asyncio.run(
        _collect(
            provider.stream_tools(
                messages=[
                    ProviderMessage("system", "be helpful"),
                    ProviderMessage("user", "weather in Paris?"),
                ],
                tools=_TOOLS,
            )
        )
    )
    assert events == [
        ToolCallRequest(id="call_1", name="get_weather", arguments={"city": "Paris"}),
        TextChunk("It is sunny."),
    ]
    # Tool specs mapped to Gemini function declarations verbatim.
    assert stream.kwargs is not None
    config = stream.kwargs["config"]
    declarations = config.tools[0].function_declarations
    assert declarations[0].name == "get_weather"
    assert config.system_instruction == "be helpful"


def test_gemini_stream_regression_no_tools() -> None:
    # The plain stream() path is unchanged: text chunks pass through.
    stream = _FakeGeminiStream(
        chunks=[SimpleNamespace(text="Hel"), SimpleNamespace(text="lo")]
    )
    provider = _gemini(stream)
    deltas = asyncio.run(
        _collect_text(provider.stream(messages=[ProviderMessage("user", "hi")]))
    )
    assert deltas == ["Hel", "lo"]


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(pytest.main([__file__, "-q"]))
