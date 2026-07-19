"""Tests for the AI tool executor (P7-B3).

No DB is touched: fake ``Tool`` subclasses return or raise, a stub object
stands in for the ``Session``, and gate tests inject a ``PermissionLayer`` (or
a fake org-members service) so nothing hits real RBAC. Fake tools are
registered into a fresh ``ToolRegistry`` per test so the global registry is
never polluted.

There is no pytest async plugin in this project, so each test drives the async
``execute`` through the stdlib ``asyncio.run`` -- no new dependency needed.
"""

from __future__ import annotations

import asyncio
import uuid
from typing import Any, cast

from fastapi import HTTPException, status
from sqlmodel import Session

from app.ai.tools.base import Tool, ToolContext, ToolResult, ToolSpec
from app.ai.tools.executor import ToolExecutor
from app.ai.tools.permissions import PermissionDenied, PermissionLayer
from app.ai.tools.registry import ToolRegistry
from app.models.users_model import User
from app.services.organization_members_service import OrganizationMemberService


def _spec(name: str) -> ToolSpec:
    return ToolSpec(
        name=name,
        description="fake",
        parameters={},
        category="test",
        capability=f"{name}.cap",
    )


class _ReturnTool(Tool):
    """Returns a preset ``ToolResult`` and records whether it ran."""

    def __init__(self, name: str, result: ToolResult) -> None:
        self.spec = _spec(name)
        self._result = result
        self.ran = False

    async def run(self, args: dict[str, Any], ctx: ToolContext) -> ToolResult:
        self.ran = True
        return self._result


class _RaiseTool(Tool):
    """Raises a preset exception when run."""

    def __init__(self, name: str, exc: BaseException) -> None:
        self.spec = _spec(name)
        self._exc = exc
        self.ran = False

    async def run(self, args: dict[str, Any], ctx: ToolContext) -> ToolResult:
        self.ran = True
        raise self._exc


class _SleepTool(Tool):
    """Sleeps longer than any tiny timeout, to trigger the timeout path."""

    def __init__(self, name: str) -> None:
        self.spec = _spec(name)

    async def run(self, args: dict[str, Any], ctx: ToolContext) -> ToolResult:
        await asyncio.sleep(1.0)
        return ToolResult(ok=True)


class _FakeOrgMembers(OrganizationMemberService):
    def __init__(self, *, allow: bool) -> None:
        self._allow = allow

    def assert_member(self, session: Any, org_id: uuid.UUID, user_id: uuid.UUID) -> Any:
        if self._allow:
            return object()
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Not a member"
        )


def _user() -> User:
    return cast(User, type("U", (), {"id": uuid.uuid4()})())


def _session() -> Session:
    return cast(Session, object())


def _ctx(workspace_id: uuid.UUID | None = None) -> ToolContext:
    return ToolContext(session=_session(), user=_user(), workspace_id=workspace_id)


def _registry(tool: Tool) -> ToolRegistry:
    reg = ToolRegistry()
    reg.register(tool)
    return reg


def test_happy_path_returns_result_unchanged() -> None:
    result = ToolResult(ok=True, content={"answer": 42}, source="task")
    tool = _ReturnTool("t", result)
    ex = ToolExecutor(registry=_registry(tool))
    out = asyncio.run(ex.execute("t", {}, _ctx()))
    assert out is result
    assert tool.ran


def test_unknown_tool() -> None:
    ex = ToolExecutor(registry=ToolRegistry())
    out = asyncio.run(ex.execute("nope", {}, _ctx()))
    assert out.ok is False
    assert out.error == "unknown_tool"


def test_workspace_gate_denies_and_tool_not_run() -> None:
    tool = _ReturnTool("t", ToolResult(ok=True))
    ex = ToolExecutor(
        registry=_registry(tool),
        permissions=PermissionLayer(org_members=_FakeOrgMembers(allow=False)),
    )
    out = asyncio.run(ex.execute("t", {}, _ctx(workspace_id=uuid.uuid4())))
    assert out.ok is False
    assert out.error == "not_authorized"
    assert tool.ran is False


def test_workspace_gate_skipped_when_no_workspace() -> None:
    tool = _ReturnTool("t", ToolResult(ok=True))
    # A denying gate would raise if consulted; it must be skipped entirely.
    ex = ToolExecutor(
        registry=_registry(tool),
        permissions=PermissionLayer(org_members=_FakeOrgMembers(allow=False)),
    )
    out = asyncio.run(ex.execute("t", {}, _ctx(workspace_id=None)))
    assert out.ok is True
    assert tool.ran


def test_tool_raises_permission_denied_not_found() -> None:
    tool = _RaiseTool("t", PermissionDenied("not_found", "gone"))
    ex = ToolExecutor(registry=_registry(tool))
    out = asyncio.run(ex.execute("t", {}, _ctx()))
    assert out.ok is False
    assert out.error == "not_found"


def test_tool_raises_http_404() -> None:
    tool = _RaiseTool("t", HTTPException(status_code=status.HTTP_404_NOT_FOUND))
    ex = ToolExecutor(registry=_registry(tool))
    out = asyncio.run(ex.execute("t", {}, _ctx()))
    assert out.ok is False
    assert out.error == "not_found"


def test_tool_raises_http_403() -> None:
    tool = _RaiseTool("t", HTTPException(status_code=status.HTTP_403_FORBIDDEN))
    ex = ToolExecutor(registry=_registry(tool))
    out = asyncio.run(ex.execute("t", {}, _ctx()))
    assert out.ok is False
    assert out.error == "not_authorized"


def test_generic_exception_does_not_leak_message() -> None:
    secret = "internal db dsn leaked"
    tool = _RaiseTool("t", RuntimeError(secret))
    ex = ToolExecutor(registry=_registry(tool))
    out = asyncio.run(ex.execute("t", {}, _ctx()))
    assert out.ok is False
    assert out.error == "tool_error"
    assert out.content is None
    assert secret not in str(out.content)


def test_timeout() -> None:
    tool = _SleepTool("t")
    ex = ToolExecutor(registry=_registry(tool), timeout_s=0.01)
    out = asyncio.run(ex.execute("t", {}, _ctx()))
    assert out.ok is False
    assert out.error == "timeout"
