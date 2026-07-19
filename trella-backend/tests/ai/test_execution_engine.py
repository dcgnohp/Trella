"""Tests for the Phase 8 Execution Engine.

No DB is touched. A fake ``WriteTool`` returns or raises; a stub session with a
no-op ``commit()`` and a fake audit repo capture created rows. Fakes are
registered into a fresh ``ToolRegistry`` per test so the global one is never
polluted. There is no pytest async plugin here, so each test drives the async
``execute`` through the stdlib ``asyncio.run`` -- no new dependency.
"""

from __future__ import annotations

import asyncio
import uuid
from typing import Any, cast

from fastapi import HTTPException, status
from sqlmodel import Session

from app.ai.agent.action_plan import ActionPlan, ActionProposal
from app.ai.agent.execution_engine import ExecutionEngine
from app.ai.tools.base import ToolContext, ToolResult, ToolSpec, WriteTool
from app.ai.tools.permissions import PermissionDenied
from app.ai.tools.registry import ToolRegistry
from app.models.users_model import User


def _spec(name: str) -> ToolSpec:
    return ToolSpec(
        name=name,
        description="fake",
        parameters={},
        category="test",
        capability=f"{name}.cap",
        capabilities=frozenset({"write"}),
        mutating=True,
    )


class _WriteTool(WriteTool):
    """Fake write tool: ``apply`` returns a preset result or raises."""

    def __init__(
        self,
        name: str,
        *,
        result: ToolResult | None = None,
        exc: BaseException | None = None,
    ) -> None:
        self.spec = _spec(name)
        self._result = result
        self._exc = exc
        self.apply_calls = 0

    async def run(self, args: dict[str, Any], ctx: ToolContext) -> ToolResult:
        # Propose phase -- unused by the Execution Engine.
        return ToolResult(ok=True, content={"preview": "p", "args": args})

    async def apply(self, args: dict[str, Any], ctx: ToolContext) -> ToolResult:
        self.apply_calls += 1
        if self._exc is not None:
            raise self._exc
        assert self._result is not None
        return self._result


class _FakeAuditRepo:
    """Captures created audit rows instead of touching a DB."""

    def __init__(self) -> None:
        self.created: list[Any] = []

    def create(self, session: Any, audit: Any) -> Any:
        self.created.append(audit)
        return audit


class _StubSession:
    def __init__(self) -> None:
        self.commits = 0

    def commit(self) -> None:
        self.commits += 1


def _user() -> User:
    return cast(User, type("U", (), {"id": uuid.uuid4()})())


def _ctx(session: _StubSession) -> ToolContext:
    return ToolContext(
        session=cast(Session, session), user=_user(), workspace_id=uuid.uuid4()
    )


def _proposal(action_id: str, tool_name: str) -> ActionProposal:
    return ActionProposal(
        action_id=action_id,
        tool_name=tool_name,
        args={"title": "x"},
        preview=f"do {action_id}",
        capabilities=frozenset({"write"}),
        scope={"workspace_id": uuid.uuid4().hex},
    )


def _plan(*proposals: ActionProposal) -> ActionPlan:
    return ActionPlan(plan_id=uuid.uuid4().hex, proposals=list(proposals))


def _engine(*tools: _WriteTool) -> tuple[ExecutionEngine, _FakeAuditRepo]:
    reg = ToolRegistry()
    for t in tools:
        reg.register(t)
    repo = _FakeAuditRepo()
    return ExecutionEngine(registry=reg, audit_repo=cast(Any, repo)), repo


def test_approve_all_executes_all_and_audits_executed() -> None:
    t1 = _WriteTool("a", result=ToolResult(ok=True, content="made 1"))
    t2 = _WriteTool("b", result=ToolResult(ok=True, content="made 2"))
    engine, repo = _engine(t1, t2)
    session = _StubSession()
    plan = _plan(_proposal("1", "a"), _proposal("2", "b"))

    out = asyncio.run(engine.execute(plan, _ctx(session), approve_all=True))

    assert [r.status for r in out] == ["executed", "executed"]
    assert all(r.ok for r in out)
    assert t1.apply_calls == 1 and t2.apply_calls == 1
    assert [a.status for a in repo.created] == ["executed", "executed"]
    assert session.commits == 2


def test_selective_approval_skips_unapproved() -> None:
    t1 = _WriteTool("a", result=ToolResult(ok=True, content="made 1"))
    t2 = _WriteTool("b", result=ToolResult(ok=True, content="made 2"))
    engine, repo = _engine(t1, t2)
    plan = _plan(_proposal("1", "a"), _proposal("2", "b"))

    out = asyncio.run(
        engine.execute(plan, _ctx(_StubSession()), approved_action_ids={"2"})
    )

    by_id = {r.action_id: r for r in out}
    assert by_id["1"].status == "skipped" and by_id["1"].ok is False
    assert by_id["2"].status == "executed"
    assert t1.apply_calls == 0  # unapproved never ran
    assert t2.apply_calls == 1
    # Only the executed action is audited.
    assert [a.tool_name for a in repo.created] == ["b"]


def test_denied_when_apply_raises_http_403() -> None:
    denied = _WriteTool(
        "a", exc=HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="secret")
    )
    ok = _WriteTool("b", result=ToolResult(ok=True, content="ok"))
    engine, repo = _engine(denied, ok)
    plan = _plan(_proposal("1", "a"), _proposal("2", "b"))

    out = asyncio.run(engine.execute(plan, _ctx(_StubSession()), approve_all=True))

    assert out[0].status == "denied" and out[0].ok is False
    assert out[0].error == "not_authorized"
    assert "secret" not in (out[0].error or "")
    # Loop continued to the next action.
    assert out[1].status == "executed"
    assert [a.status for a in repo.created] == ["denied", "executed"]


def test_permission_denied_exception_uses_code() -> None:
    tool = _WriteTool("a", exc=PermissionDenied("not_found", "gone"))
    engine, repo = _engine(tool)
    plan = _plan(_proposal("1", "a"))

    out = asyncio.run(engine.execute(plan, _ctx(_StubSession()), approve_all=True))

    assert out[0].status == "denied"
    assert out[0].error == "not_found"
    assert repo.created[0].status == "denied"


def test_failed_does_not_leak_exception_message() -> None:
    secret = "internal db dsn leaked"
    tool = _WriteTool("a", exc=RuntimeError(secret))
    engine, repo = _engine(tool)
    plan = _plan(_proposal("1", "a"))

    out = asyncio.run(engine.execute(plan, _ctx(_StubSession()), approve_all=True))

    assert out[0].status == "failed" and out[0].ok is False
    assert out[0].error == "tool_error"
    assert secret not in (out[0].error or "")
    assert secret not in (out[0].summary or "")
    assert repo.created[0].status == "failed"


def test_non_403_http_exception_is_failed() -> None:
    tool = _WriteTool(
        "a", exc=HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR)
    )
    engine, _ = _engine(tool)
    plan = _plan(_proposal("1", "a"))

    out = asyncio.run(engine.execute(plan, _ctx(_StubSession()), approve_all=True))

    assert out[0].status == "failed"
    assert out[0].error == "tool_error"


def test_unknown_tool_is_reported_and_not_audited() -> None:
    ok = _WriteTool("b", result=ToolResult(ok=True, content="ok"))
    engine, repo = _engine(ok)  # tool "a" is NOT registered
    plan = _plan(_proposal("1", "a"), _proposal("2", "b"))

    out = asyncio.run(engine.execute(plan, _ctx(_StubSession()), approve_all=True))

    assert out[0].status == "unknown_tool" and out[0].error == "unknown_tool"
    assert out[1].status == "executed"  # others still run
    # Unknown tool never ran -> no audit row for it.
    assert [a.tool_name for a in repo.created] == ["b"]


def test_one_failing_action_does_not_abort_following_success() -> None:
    boom = _WriteTool("a", exc=RuntimeError("boom"))
    ok = _WriteTool("b", result=ToolResult(ok=True, content="ok"))
    engine, repo = _engine(boom, ok)
    plan = _plan(_proposal("1", "a"), _proposal("2", "b"))

    out = asyncio.run(engine.execute(plan, _ctx(_StubSession()), approve_all=True))

    assert out[0].status == "failed"
    assert out[1].status == "executed"
    assert ok.apply_calls == 1
    assert [a.status for a in repo.created] == ["failed", "executed"]
