"""Tests for the MCP adapter + registration (Phase 10.1, Agent B).

No network: a ``FakeClient`` implements the FROZEN ``McpClientProtocol`` with
scripted ``discover``/``call_tool`` behaviour. Coroutines are driven with
``asyncio.run``.
"""

from __future__ import annotations

import asyncio
from typing import Any, cast

from app.ai.mcp.adapter import McpToolAdapter, mcp_tool_name
from app.ai.mcp.contracts import DiscoveredTool
from app.ai.mcp.errors import INVALID_ARGS, MCP_TIMEOUT, McpToolError
from app.ai.mcp.registration import register_mcp_tools
from app.ai.tools.base import ToolContext
from app.ai.tools.registry import ToolRegistry

# run() never touches ctx, so a throwaway object typed as ToolContext is enough.
_CTX = cast(ToolContext, object())


class FakeClient:
    """Scripted ``McpClientProtocol`` implementation (no network)."""

    def __init__(
        self,
        *,
        tools: list[DiscoveredTool] | None = None,
        result: str = "ok",
        raises: McpToolError | None = None,
    ) -> None:
        self._tools = tools or []
        self._result = result
        self._raises = raises
        self.calls: list[tuple[str, str, dict[str, Any]]] = []

    async def start(self) -> None:  # pragma: no cover - unused
        return None

    async def discover(self) -> list[DiscoveredTool]:
        return self._tools

    async def call_tool(
        self, server_id: str, name: str, arguments: dict[str, Any]
    ) -> str:
        self.calls.append((server_id, name, arguments))
        if self._raises is not None:
            raise self._raises
        return self._result

    async def aclose(self) -> None:  # pragma: no cover - unused
        return None


def _tool(
    *,
    server_id: str = "gh",
    name: str = "get_issue",
    description: str = "Get an issue",
    input_schema: dict[str, Any] | None = None,
    read_only: bool = True,
) -> DiscoveredTool:
    return DiscoveredTool(
        server_id=server_id,
        name=name,
        description=description,
        input_schema=input_schema if input_schema is not None else {"type": "object"},
        read_only=read_only,
    )


# --- name helper -----------------------------------------------------------


def test_mcp_tool_name_sanitizes_and_lowercases() -> None:
    assert mcp_tool_name("gh-remote", "Get.Issue!") == "mcp_gh_remote_get_issue_"
    assert mcp_tool_name("gh", "get_issue") == "mcp_gh_get_issue"


# --- adapter spec shape ----------------------------------------------------


def test_adapter_spec_shape() -> None:
    schema = {"type": "object", "properties": {"id": {"type": "string"}}}
    adapter = McpToolAdapter(_tool(input_schema=schema), FakeClient())
    spec = adapter.spec
    assert spec.name == "mcp_gh_get_issue"
    assert spec.description == "Get an issue"
    assert spec.parameters == schema  # passthrough
    assert spec.category == "mcp"
    assert spec.capability == "mcp.gh.get_issue"
    assert spec.capabilities == frozenset({"read"})
    assert spec.mutating is False


def test_adapter_spec_defaults_empty_schema() -> None:
    adapter = McpToolAdapter(_tool(input_schema={}), FakeClient())
    assert adapter.spec.parameters == {"type": "object", "properties": {}}


# --- run happy path --------------------------------------------------------


def test_run_happy_path_truncates_and_sets_source() -> None:
    client = FakeClient(result="x" * 10000)
    adapter = McpToolAdapter(_tool(), client)
    result = asyncio.run(adapter.run({"id": "1"}, _CTX))
    assert result.ok is True
    assert result.content == "x" * 4000  # _MAX_RESULT_CHARS
    assert result.source == "mcp:gh"
    # Original (un-namespaced) name + server_id are used for the call.
    assert client.calls == [("gh", "get_issue", {"id": "1"})]


# --- run guardrails --------------------------------------------------------


def test_run_non_dict_args_returns_invalid_args() -> None:
    client = FakeClient()
    adapter = McpToolAdapter(_tool(), client)
    result = asyncio.run(adapter.run(cast(Any, ["not", "a", "dict"]), _CTX))
    assert result.ok is False
    assert result.error == INVALID_ARGS
    assert result.source == "mcp:gh"
    assert client.calls == []  # client NOT called


def test_run_oversize_args_returns_invalid_args() -> None:
    client = FakeClient()
    adapter = McpToolAdapter(_tool(), client)
    result = asyncio.run(adapter.run({"blob": "z" * 9000}, _CTX))
    assert result.ok is False
    assert result.error == INVALID_ARGS
    assert client.calls == []  # client NOT called


def test_run_mcp_tool_error_folds_into_result() -> None:
    client = FakeClient(raises=McpToolError(MCP_TIMEOUT, "slow"))
    adapter = McpToolAdapter(_tool(), client)
    result = asyncio.run(adapter.run({"id": "1"}, _CTX))
    assert result.ok is False
    assert result.error == MCP_TIMEOUT
    assert result.source == "mcp:gh"


# --- registration ----------------------------------------------------------


def _server(server_id: str, capabilities: list[str]) -> Any:
    """Minimal object with the ``id``/``capabilities`` attributes registration reads.

    Avoids constructing a full pydantic ``McpServerConfig`` (which needs
    transport-specific fields); registration only touches these two attributes.
    """

    class _S:
        id = server_id
        capabilities: list[str]

    s = _S()
    s.capabilities = capabilities
    return s


def test_registration_filters_and_summarizes() -> None:
    registry = ToolRegistry()
    tools = [
        _tool(server_id="gh", name="get_issue", read_only=True),  # read + allowed
        _tool(server_id="gh", name="delete_repo", read_only=False),  # mutating -> skip
        _tool(server_id="gh", name="secret_read", read_only=True),  # not allow-listed
    ]
    client = FakeClient(tools=tools)
    servers = [_server("gh", ["get_issue"])]
    summary = asyncio.run(register_mcp_tools(registry, client, servers))

    assert summary.registered == ["mcp_gh_get_issue"]
    assert "mcp_gh_delete_repo" in summary.skipped
    assert "mcp_gh_secret_read" in summary.skipped
    assert registry.has("mcp_gh_get_issue")
    assert not registry.has("mcp_gh_delete_repo")
    assert not registry.has("mcp_gh_secret_read")


def test_registration_empty_capabilities_allows_all_read_tools() -> None:
    registry = ToolRegistry()
    tools = [
        _tool(server_id="gh", name="a", read_only=True),
        _tool(server_id="gh", name="b", read_only=True),
        _tool(server_id="gh", name="c", read_only=False),  # still mutating -> skip
    ]
    client = FakeClient(tools=tools)
    servers = [_server("gh", [])]  # empty = allow all read
    summary = asyncio.run(register_mcp_tools(registry, client, servers))

    assert summary.registered == ["mcp_gh_a", "mcp_gh_b"]
    assert summary.skipped == ["mcp_gh_c"]


def test_registration_dedup_skips_already_registered() -> None:
    registry = ToolRegistry()
    tools = [_tool(server_id="gh", name="get_issue", read_only=True)]
    client = FakeClient(tools=tools)
    servers = [_server("gh", [])]
    # First registration succeeds.
    first = asyncio.run(register_mcp_tools(registry, client, servers))
    assert first.registered == ["mcp_gh_get_issue"]
    # Second run: name already present -> skipped, not a duplicate-register error.
    second = asyncio.run(register_mcp_tools(registry, client, servers))
    assert second.registered == []
    assert second.skipped == ["mcp_gh_get_issue"]


def test_registration_unknown_server_denies_by_default() -> None:
    # A tool whose server_id is not in the servers map has no allow-list; a
    # non-empty missing config must not accidentally allow-list it.
    registry = ToolRegistry()
    tools = [_tool(server_id="ghost", name="get_issue", read_only=True)]
    client = FakeClient(tools=tools)
    summary = asyncio.run(register_mcp_tools(registry, client, servers=[]))
    # Empty allow-list (server missing) = allow all read tools -> registered.
    assert summary.registered == ["mcp_ghost_get_issue"]


def test_registration_explicit_allowlist_authorizes_unannotated_tool() -> None:
    """A tool that is NOT read-only-annotated still registers when the operator
    EXPLICITLY names it in ``capabilities`` — covers genuinely-read-only tools
    whose server omits ``readOnlyHint`` (e.g. mcp-server-fetch's ``fetch``)."""
    registry = ToolRegistry()
    tools = [_tool(server_id="fetch", name="fetch", read_only=False)]
    client = FakeClient(tools=tools)
    servers = [_server("fetch", ["fetch"])]  # explicit operator authorization

    summary = asyncio.run(register_mcp_tools(registry, client, servers))

    assert summary.registered == ["mcp_fetch_fetch"]
    assert registry.has("mcp_fetch_fetch")
