"""Phase 10.1 MCP integration: registration → real ToolExecutor (no network).

Proves an MCP tool, once registered, is resolvable and runnable through the
SAME ``ToolExecutor`` the Reasoning Engine uses — end-to-end within the tool
framework, without a live MCP server. A fake client implements the frozen
``McpClientProtocol``.
"""

from __future__ import annotations

import asyncio
from types import SimpleNamespace
from typing import Any, cast

from app.ai.mcp.contracts import DiscoveredTool
from app.ai.mcp.errors import MCP_UNAVAILABLE, McpToolError
from app.ai.mcp.registration import register_mcp_tools
from app.ai.tools.base import ToolContext
from app.ai.tools.executor import ToolExecutor
from app.ai.tools.registry import ToolRegistry
from app.models.users_model import User


class _FakeClient:
    def __init__(
        self,
        tools: list[DiscoveredTool],
        *,
        result: str = "hello",
        raises: McpToolError | None = None,
    ) -> None:
        self._tools = tools
        self._result = result
        self._raises = raises

    async def start(self) -> None: ...
    async def discover(self) -> list[DiscoveredTool]:
        return self._tools

    async def call_tool(
        self, server_id: str, name: str, arguments: dict[str, Any]
    ) -> str:
        if self._raises is not None:
            raise self._raises
        return self._result

    async def aclose(self) -> None: ...


def _tool(name: str, *, read_only: bool = True) -> DiscoveredTool:
    return DiscoveredTool(
        server_id="gh",
        name=name,
        description=f"{name} tool",
        input_schema={"type": "object"},
        read_only=read_only,
    )


# workspace_id=None so the executor's workspace permission gate is skipped
# (MCP tools access no Trella business data); ctx is otherwise unused by the adapter.
def _ctx() -> ToolContext:
    return ToolContext(
        session=cast(Any, object()),
        user=cast(User, SimpleNamespace()),
        workspace_id=None,
    )


def test_registered_mcp_tool_runs_through_executor() -> None:
    registry = ToolRegistry()
    client = _FakeClient([_tool("get_issue")], result="issue #1 details")
    servers = [SimpleNamespace(id="gh", capabilities=[])]
    summary = asyncio.run(
        register_mcp_tools(registry, cast(Any, client), cast(Any, servers))
    )
    assert summary.registered == ["mcp_gh_get_issue"]

    executor = ToolExecutor(registry=registry)
    result = asyncio.run(executor.execute("mcp_gh_get_issue", {"id": "1"}, _ctx()))
    assert result.ok is True
    assert result.content == "issue #1 details"
    assert result.source == "mcp:gh"


def test_executor_folds_mcp_failure_into_toolresult() -> None:
    registry = ToolRegistry()
    client = _FakeClient([_tool("get_issue")], raises=McpToolError(MCP_UNAVAILABLE))
    servers = [SimpleNamespace(id="gh", capabilities=[])]
    asyncio.run(register_mcp_tools(registry, cast(Any, client), cast(Any, servers)))

    executor = ToolExecutor(registry=registry)
    result = asyncio.run(executor.execute("mcp_gh_get_issue", {"id": "1"}, _ctx()))
    assert result.ok is False
    assert result.error == MCP_UNAVAILABLE


def test_mutating_mcp_tool_is_not_registered_so_executor_cannot_run_it() -> None:
    registry = ToolRegistry()
    client = _FakeClient([_tool("delete_repo", read_only=False)])
    servers = [SimpleNamespace(id="gh", capabilities=[])]
    asyncio.run(register_mcp_tools(registry, cast(Any, client), cast(Any, servers)))

    executor = ToolExecutor(registry=registry)
    result = asyncio.run(executor.execute("mcp_gh_delete_repo", {}, _ctx()))
    assert result.ok is False
    assert result.error == "unknown_tool"  # never registered → not runnable
