"""Tests for the Reasoning Engine bounded loop (P7-B7).

No DB, no network. A ``_FakeProvider`` yields SCRIPTED events per turn (backed by
a list of "turn scripts" popped one per ``stream_tools`` call). Fake ``Tool``s
are registered into a fresh ``ToolRegistry`` and run through a real
``ToolExecutor``; the ``ToolContext`` uses a stub session/user with
``workspace_id=None`` so the executor's workspace gate is skipped and tools run.
Async generators are driven with ``asyncio.run`` — no pytest-async plugin.
"""

from __future__ import annotations

import asyncio
import uuid
from collections.abc import AsyncIterator
from typing import Any, cast

import pytest
from sqlmodel import Session

from app.ai.agent.action_plan import ActionPlanStore
from app.ai.providers.base import (
    AIProvider,
    GenerationResult,
    ProviderMessage,
    StreamEvent,
    TextChunk,
    ToolCallRequest,
)
from app.ai.reasoning.engine import (
    ActionProposalEvent,
    PlanReadyEvent,
    ProgressEvent,
    ReasoningEngine,
    ReasoningEvent,
    TextEvent,
    ToolCallEvent,
    ToolResultEvent,
    _progress_for_category,
)
from app.ai.tools.base import Tool, ToolContext, ToolResult, ToolSpec, WriteTool
from app.ai.tools.executor import ToolExecutor
from app.ai.tools.registry import ToolRegistry
from app.ai.utils.errors import InvalidPrompt
from app.models.users_model import User

# --- fakes ----------------------------------------------------------------


class _FakeProvider(AIProvider):
    """Yields one scripted list of StreamEvents per ``stream_tools`` call.

    ``turns`` is a list of turn scripts; each call pops the next one. If more
    turns are requested than scripted (should not happen when bounded), an empty
    turn (final answer) is returned.
    """

    name = "fake"

    def __init__(self, turns: list[list[StreamEvent]]) -> None:
        self._turns = turns
        self.calls = 0

    async def generate(self, **kwargs: Any) -> GenerationResult:  # pragma: no cover
        return GenerationResult(content="", model="fake", provider="fake")

    async def health_check(self) -> bool:  # pragma: no cover
        return True

    async def stream_tools(
        self, *, messages: Any, tools: Any, **kwargs: Any
    ) -> AsyncIterator[StreamEvent]:
        turn = self._turns[self.calls] if self.calls < len(self._turns) else []
        self.calls += 1
        for ev in turn:
            yield ev


class _CountingTool(Tool):
    """Records how many times ``run`` executed; returns a preset result."""

    def __init__(
        self,
        name: str,
        *,
        category: str = "task",
        capability: str = "task.lookup",
        result: ToolResult | None = None,
    ) -> None:
        self.spec = ToolSpec(
            name=name,
            description="fake tool",
            parameters={"type": "object", "properties": {}},
            category=category,
            capability=capability,
        )
        self._result = result or ToolResult(ok=True, content="data", source="task")
        self.runs = 0

    async def run(self, args: dict[str, Any], ctx: ToolContext) -> ToolResult:
        self.runs += 1
        return self._result


class _FakeWriteTool(WriteTool):
    """A mutating tool. ``run`` PROPOSES; ``apply`` RAISES if ever called.

    ``apply`` blowing up proves the engine NEVER executes a write inside the
    reasoning loop — it only ever runs the safe PROPOSE phase (``run``).
    """

    def __init__(
        self,
        name: str = "create_task",
        *,
        result: ToolResult | None = None,
    ) -> None:
        self.spec = ToolSpec(
            name=name,
            description="fake write tool",
            parameters={"type": "object", "properties": {}},
            category="task",
            capability="task.create",
            capabilities=frozenset({"write"}),
            mutating=True,
        )
        self._result = result or ToolResult(
            ok=True, content={"preview": "Create task X", "args": {"title": "X"}}
        )
        self.applied = 0

    async def run(self, args: dict[str, Any], ctx: ToolContext) -> ToolResult:
        return self._result

    async def apply(self, args: dict[str, Any], ctx: ToolContext) -> ToolResult:
        self.applied += 1
        raise AssertionError("apply() must never be called from the reasoning loop")


def _ctx() -> ToolContext:
    user = cast(User, type("U", (), {"id": uuid.uuid4()})())
    return ToolContext(session=cast(Session, object()), user=user, workspace_id=None)


def _engine(provider: _FakeProvider, tool: Tool, **kwargs: Any) -> ReasoningEngine:
    reg = ToolRegistry()
    reg.register(tool)
    return ReasoningEngine(provider, registry=reg, executor=ToolExecutor(reg), **kwargs)


def _collect(engine: ReasoningEngine, **run_kwargs: Any) -> list[ReasoningEvent]:
    async def _drive() -> list[ReasoningEvent]:
        return [ev async for ev in engine.run(**run_kwargs)]

    return asyncio.run(_drive())


def _run_kwargs() -> dict[str, Any]:
    return {
        "system_message": "be helpful",
        "messages": [ProviderMessage("user", "hi")],
        "tool_ctx": _ctx(),
        "conversation_id": "conv-1",
    }


# --- tests -----------------------------------------------------------------


def test_single_tool_call_then_final_text() -> None:
    tool = _CountingTool("lookup")
    provider = _FakeProvider(
        turns=[
            [ToolCallRequest(id="c1", name="lookup", arguments={"q": "x"})],
            [TextChunk("final")],
        ]
    )
    events = _collect(_engine(provider, tool), **_run_kwargs())

    assert ProgressEvent("planning", "Planning...") == events[0]
    assert any(isinstance(e, ToolCallEvent) and e.name == "lookup" for e in events)
    assert any(
        isinstance(e, ToolResultEvent) and e.name == "lookup" and e.ok for e in events
    )
    assert TextEvent("final") in events
    assert events[-1] == ProgressEvent("complete", "Complete")
    assert tool.runs == 1


def test_session_memory_reuse_runs_tool_once() -> None:
    tool = _CountingTool("lookup")
    # Same tool + same args requested across two turns, then a final answer.
    provider = _FakeProvider(
        turns=[
            [ToolCallRequest(id="c1", name="lookup", arguments={"q": "x"})],
            [ToolCallRequest(id="c2", name="lookup", arguments={"q": "x"})],
            [TextChunk("done")],
        ]
    )
    events = _collect(_engine(provider, tool, max_tool_calls=5), **_run_kwargs())

    # Second identical call resolves from SessionMemory, so run() fired once.
    assert tool.runs == 1
    # Both turns still emitted a ToolResultEvent (memory hit is transparent).
    assert sum(isinstance(e, ToolResultEvent) for e in events) == 2
    assert TextEvent("done") in events


def test_max_tool_calls_guard_terminates() -> None:
    tool = _CountingTool("lookup")
    # Model keeps requesting a (distinct-args) tool every turn, never answering.
    provider = _FakeProvider(
        turns=[
            [ToolCallRequest(id=f"c{i}", name="lookup", arguments={"n": i})]
            for i in range(10)
        ]
    )
    events = _collect(_engine(provider, tool, max_tool_calls=1), **_run_kwargs())

    # At most one execution despite the model's insistence, and the loop ends.
    assert tool.runs == 1
    assert events[-1] == ProgressEvent("complete", "Complete")


def test_empty_messages_raises_eagerly() -> None:
    engine = _engine(_FakeProvider(turns=[]), _CountingTool("lookup"))
    with pytest.raises(InvalidPrompt):
        engine.run(
            system_message="be helpful",
            messages=[],
            tool_ctx=_ctx(),
            conversation_id="conv-1",
        )


def test_progress_for_category_mapping() -> None:
    assert _progress_for_category("task").kind == "searching_tasks"
    assert _progress_for_category("sprint").kind == "reading_sprint"
    assert _progress_for_category("knowledge").kind == "reading_documentation"
    assert _progress_for_category("nonsense").kind == "searching_workspace"
    assert _progress_for_category(None).kind == "searching_workspace"


# --- agent mode (Phase 8) --------------------------------------------------


def test_mutating_tool_is_proposed_not_executed() -> None:
    tool = _FakeWriteTool("create_task")
    store = ActionPlanStore()
    provider = _FakeProvider(
        turns=[
            [ToolCallRequest(id="c1", name="create_task", arguments={"title": "X"})],
            [TextChunk("proposed a task for you")],
        ]
    )
    events = _collect(_engine(provider, tool, plan_store=store), **_run_kwargs())

    # A proposal was emitted with the write tool's preview — but never applied.
    proposals = [e for e in events if isinstance(e, ActionProposalEvent)]
    assert len(proposals) == 1
    assert proposals[0].tool_name == "create_task"
    assert proposals[0].preview == "Create task X"
    assert tool.applied == 0

    # A single-proposal plan is announced and retrievable from the store.
    ready = [e for e in events if isinstance(e, PlanReadyEvent)]
    assert len(ready) == 1
    assert ready[0].action_count == 1
    assert ready[0].plan_id
    plan = store.get(ready[0].plan_id)
    assert plan is not None
    assert len(plan.proposals) == 1
    assert plan.proposals[0].args == {"title": "X"}
    assert plan.proposals[0].capabilities == frozenset({"write"})

    # Final text still streams and the loop completes normally.
    assert TextEvent("proposed a task for you") in events
    assert events[-1] == ProgressEvent("complete", "Complete")


def test_invalid_write_args_feeds_error_no_proposal() -> None:
    tool = _FakeWriteTool(
        "create_task",
        result=ToolResult(ok=False, error="invalid_args", source="task"),
    )
    store = ActionPlanStore()
    provider = _FakeProvider(
        turns=[
            [ToolCallRequest(id="c1", name="create_task", arguments={})],
            [TextChunk("could not create")],
        ]
    )
    events = _collect(_engine(provider, tool, plan_store=store), **_run_kwargs())

    # Failed PROPOSE surfaces a failed ToolResultEvent and creates NO proposal.
    assert any(
        isinstance(e, ToolResultEvent) and e.name == "create_task" and not e.ok
        for e in events
    )
    assert not any(isinstance(e, ActionProposalEvent) for e in events)
    assert not any(isinstance(e, PlanReadyEvent) for e in events)
    assert tool.applied == 0
    assert events[-1] == ProgressEvent("complete", "Complete")


def test_read_path_emits_no_proposal_events() -> None:
    """Phase 7 read path is unchanged: no proposal/plan events appear."""
    tool = _CountingTool("lookup")
    provider = _FakeProvider(
        turns=[
            [ToolCallRequest(id="c1", name="lookup", arguments={"q": "x"})],
            [TextChunk("final")],
        ]
    )
    events = _collect(_engine(provider, tool), **_run_kwargs())

    assert not any(isinstance(e, ActionProposalEvent) for e in events)
    assert not any(isinstance(e, PlanReadyEvent) for e in events)
    assert any(isinstance(e, ToolResultEvent) and e.ok for e in events)
    assert tool.runs == 1


# --- agent refinements ------------------------------------------------------


class _FlakyTool(Tool):
    """Returns a transient (or deterministic) error N times, then succeeds."""

    def __init__(self, name: str, *, fail_times: int, error: str = "timeout") -> None:
        self.spec = ToolSpec(
            name=name,
            description="flaky",
            parameters={"type": "object", "properties": {}},
            category="task",
            capability="task.flaky",
        )
        self._fail_times = fail_times
        self._error = error
        self.runs = 0

    async def run(self, args: dict[str, Any], ctx: ToolContext) -> ToolResult:
        self.runs += 1
        if self.runs <= self._fail_times:
            return ToolResult(ok=False, error=self._error, source="task")
        return ToolResult(ok=True, content="ok", source="task")


def _retry_engine(tool: Tool) -> ReasoningEngine:
    reg = ToolRegistry()
    reg.register(tool)
    return ReasoningEngine(
        _FakeProvider(turns=[]), registry=reg, executor=ToolExecutor(reg)
    )


def test_read_tool_retried_once_on_transient_error() -> None:
    tool = _FlakyTool("t", fail_times=1, error="timeout")
    engine = _retry_engine(tool)
    result = asyncio.run(
        engine._execute_read_with_retry(
            ToolCallRequest(id="c1", name="t", arguments={}), _ctx()
        )
    )
    assert result.ok is True
    assert tool.runs == 2  # failed once, retried, succeeded


def test_read_tool_not_retried_on_deterministic_error() -> None:
    tool = _FlakyTool("t", fail_times=1, error="not_authorized")
    engine = _retry_engine(tool)
    result = asyncio.run(
        engine._execute_read_with_retry(
            ToolCallRequest(id="c1", name="t", arguments={}), _ctx()
        )
    )
    assert result.ok is False
    assert result.error == "not_authorized"
    assert tool.runs == 1  # deterministic errors are NOT retried


def test_summarize_observation_truncates_large_content_but_stays_valid_json() -> None:
    import json

    from app.ai.reasoning.engine import _MAX_OBSERVATION_CHARS, _summarize_observation

    big = ToolResult(
        ok=True, content={"items": ["x" * 100 for _ in range(500)]}, source="task"
    )
    out = _summarize_observation(big)
    parsed = json.loads(out)  # must remain valid JSON
    assert parsed["ok"] is True
    assert "truncated" in str(parsed["content"])
    assert len(out) <= _MAX_OBSERVATION_CHARS + 200

    small = ToolResult(ok=True, content={"a": 1}, source="task")
    assert json.loads(_summarize_observation(small))["content"] == {"a": 1}


def test_agent_reasoning_prompt_renders_from_disk() -> None:
    from app.ai.prompts.prompt_manager import PromptManager

    out = PromptManager().render("agent_reasoning", {"current_view": "- (none)"})
    assert "Answering with tools" in out
    assert "TOPIC CARRIES OVER" in out
    assert "- (none)" in out


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(pytest.main([__file__, "-q"]))
