"""P6-B0 checks: AI middleware pipeline core.

Verifies the onion ordering of ``AIPipeline`` (outer -> inner -> terminal and
unwind), that ``supports_streaming = False`` middlewares are skipped in
``stream()`` but present in ``execute()``, and that ``AIBaseService`` routes
``run``/``run_structured``/``run_stream`` through configured middlewares while
staying a pass-through with none.
"""

import asyncio
from collections.abc import AsyncIterator

from app.ai.pipeline import (
    AICallContext,
    AIMiddleware,
    AIPipeline,
    AIResult,
    Handler,
    StreamHandler,
)
from app.ai.providers.base import (
    AIProvider,
    GenerationResult,
    ProviderMessage,
    StructuredResult,
    T,
)
from app.ai.services.ai_base_service import AIBaseService
from app.core.base import CamelModel


class _Recorder(AIMiddleware):
    """Records enter/exit around the next handler for both unary and stream."""

    def __init__(self, name: str, log: list[str], supports_streaming: bool = True):
        self._name = name
        self._log = log
        self.supports_streaming = supports_streaming

    async def handle(self, ctx: AICallContext, nxt: Handler) -> AIResult:
        self._log.append(f"enter:{self._name}")
        result = await nxt(ctx)
        self._log.append(f"exit:{self._name}")
        return result

    def handle_stream(
        self, ctx: AICallContext, nxt: StreamHandler
    ) -> AsyncIterator[str]:
        self._log.append(f"stream:{self._name}")
        return nxt(ctx)


def _ctx(kind: str = "generate") -> AICallContext:
    return AICallContext(kind=kind, feature="t", model=None, params={}, payload={})  # type: ignore[arg-type]


def test_execute_runs_onion_order_and_unwinds() -> None:
    log: list[str] = []
    pipeline = AIPipeline([_Recorder("a", log), _Recorder("b", log)])

    async def terminal(_c: AICallContext) -> AIResult:
        log.append("terminal")
        return AIResult(value="ok")

    result = asyncio.run(pipeline.execute(_ctx(), terminal))

    assert result.value == "ok"
    # Outer (a) wraps inner (b) wraps terminal, then unwinds b -> a.
    assert log == ["enter:a", "enter:b", "terminal", "exit:b", "exit:a"]


def test_stream_skips_non_streaming_but_execute_includes_it() -> None:
    stream_log: list[str] = []
    unary_log: list[str] = []
    cache = _Recorder("cache", stream_log, supports_streaming=False)
    metrics = _Recorder("metrics", stream_log)
    pipeline = AIPipeline([cache, metrics])

    async def stream_terminal(_c: AICallContext) -> AsyncIterator[str]:
        yield "x"

    out = asyncio.run(_drain(pipeline.stream(_ctx("stream"), stream_terminal)))
    assert out == ["x"]
    # cache is unary-only and must be skipped; metrics still runs.
    assert stream_log == ["stream:metrics"]

    # In execute() the same cache middleware participates.
    cache2 = _Recorder("cache", unary_log, supports_streaming=False)
    pipeline2 = AIPipeline([cache2])

    async def terminal(_c: AICallContext) -> AIResult:
        unary_log.append("terminal")
        return AIResult()

    asyncio.run(pipeline2.execute(_ctx(), terminal))
    assert unary_log == ["enter:cache", "terminal", "exit:cache"]


async def _drain(it: AsyncIterator[str]) -> list[str]:
    return [d async for d in it]


# --- AIBaseService routing -------------------------------------------------


class _Model(CamelModel):
    value: str


class _FakeProvider(AIProvider):
    name = "fake"

    def __init__(self) -> None:
        self.seen_prompt: str | None = None
        self.seen_messages: list[ProviderMessage] | None = None

    async def generate(
        self,
        *,
        prompt: str,
        model: str | None = None,
        temperature: float = 0.0,
        max_tokens: int | None = None,
        timeout: float | None = None,
    ) -> GenerationResult:
        self.seen_prompt = prompt
        return GenerationResult(content="hi", model="m", provider="fake")

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
        parsed = response_model.model_validate({"value": "ok"})
        return StructuredResult(parsed=parsed, model="m", provider="fake")

    async def stream(
        self,
        *,
        messages: list[ProviderMessage],
        model: str | None = None,
        temperature: float = 0.0,
        max_tokens: int | None = None,
        timeout: float | None = None,
    ) -> AsyncIterator[str]:
        self.seen_messages = messages
        for delta in ("a", "b"):
            yield delta

    async def health_check(self) -> bool:
        return True


def _prompts(tmp_path):  # type: ignore[no-untyped-def]
    from app.ai.prompts.prompt_manager import PromptManager

    (tmp_path / "greet.md").write_text("Hello {{name}}")
    return PromptManager(prompts_dir=tmp_path)


def test_base_service_routes_all_calls_through_middleware(tmp_path) -> None:  # type: ignore[no-untyped-def]
    log: list[str] = []
    mw = _Recorder("mw", log)
    provider = _FakeProvider()
    service = AIBaseService(provider, _prompts(tmp_path), [mw])

    resp = asyncio.run(service.run(prompt_name="greet", variables={"name": "Ada"}))
    assert resp.content == "hi"

    parsed = asyncio.run(
        service.run_structured(
            prompt_name="greet",
            variables={"name": "Ada"},
            response_model=_Model,
        )
    )
    assert parsed.value == "ok"

    out = asyncio.run(
        _drain(
            service.run_stream(
                system_message="SYS", messages=[ProviderMessage("user", "hi")]
            )
        )
    )
    assert out == ["a", "b"]

    # run + run_structured go through handle (enter/exit); run_stream through
    # handle_stream (stream:mw).
    assert log == [
        "enter:mw",
        "exit:mw",
        "enter:mw",
        "exit:mw",
        "stream:mw",
    ]


def test_base_service_without_middleware_is_passthrough(tmp_path) -> None:  # type: ignore[no-untyped-def]
    provider = _FakeProvider()
    service = AIBaseService(provider, _prompts(tmp_path))

    resp = asyncio.run(service.run(prompt_name="greet", variables={"name": "Ada"}))
    assert resp.content == "hi"
    assert provider.seen_prompt == "Hello Ada"

    out = asyncio.run(
        _drain(
            service.run_stream(
                system_message="SYS", messages=[ProviderMessage("user", "hi")]
            )
        )
    )
    assert out == ["a", "b"]
    assert provider.seen_messages is not None
    assert provider.seen_messages[0] == ProviderMessage("system", "SYS")
