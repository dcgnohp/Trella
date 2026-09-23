"""Tests for the MCP transport + client (Phase 10.1, Agent A).

NO network and NO real subprocess: the transport/session are faked and injected
via the ``transport_factory`` seam. Coroutines are driven with ``asyncio.run``.
"""

from __future__ import annotations

import asyncio
from types import SimpleNamespace
from typing import Any

import pytest

from app.ai.mcp.client import McpClient, _join_text
from app.ai.mcp.config import McpServerConfig, McpTransportKind
from app.ai.mcp.contracts import McpTransport
from app.ai.mcp.errors import (
    MCP_ERROR,
    MCP_TIMEOUT,
    MCP_UNAVAILABLE,
    McpToolError,
)
from app.ai.mcp.transport import (
    HttpTransport,
    StdioTransport,
    _auth_headers,
    build_transport,
)


# --------------------------------------------------------------------------- #
# Fakes
# --------------------------------------------------------------------------- #
def _tool(name: str, *, read_only_hint: Any = "absent", schema: Any = None) -> Any:
    """Build a fake mcp Tool. ``read_only_hint='absent'`` -> no annotations."""
    if read_only_hint == "absent":
        annotations = None
    else:
        annotations = SimpleNamespace(readOnlyHint=read_only_hint)
    return SimpleNamespace(
        name=name,
        description=f"desc-{name}",
        inputSchema=schema,
        annotations=annotations,
    )


def _text_part(text: str) -> Any:
    return SimpleNamespace(type="text", text=text)


class FakeSession:
    """A stand-in for mcp.ClientSession with the methods the client uses."""

    def __init__(
        self,
        *,
        tools: list[Any] | None = None,
        call_result: Any = None,
        list_tools_exc: Exception | None = None,
        call_exc: Exception | None = None,
        call_delay: float = 0.0,
    ) -> None:
        self._tools = tools or []
        self._call_result = call_result
        self._list_tools_exc = list_tools_exc
        self._call_exc = call_exc
        self._call_delay = call_delay
        self.initialized = False

    async def initialize(self) -> None:
        self.initialized = True

    async def list_tools(self) -> Any:
        if self._list_tools_exc is not None:
            raise self._list_tools_exc
        return SimpleNamespace(tools=self._tools)

    async def call_tool(self, name: str, arguments: dict[str, Any]) -> Any:
        if self._call_delay:
            await asyncio.sleep(self._call_delay)
        if self._call_exc is not None:
            raise self._call_exc
        return self._call_result


class FakeTransport(McpTransport):
    """Transport whose open() yields a preset FakeSession (or fails)."""

    def __init__(
        self, session: FakeSession | None, *, open_exc: Exception | None = None
    ) -> None:
        self._session = session
        self._open_exc = open_exc
        self.closed = 0

    async def open(self) -> Any:
        if self._open_exc is not None:
            raise self._open_exc
        return self._session

    async def close(self) -> None:
        self.closed += 1


def _cfg(server_id: str = "s1", *, timeout: float = 30.0) -> McpServerConfig:
    return McpServerConfig(
        id=server_id, transport=McpTransportKind.STDIO, command="echo", timeout=timeout
    )


def _factory(mapping: dict[str, FakeTransport]) -> Any:
    def factory(cfg: McpServerConfig) -> McpTransport:
        return mapping[cfg.id]

    return factory


# --------------------------------------------------------------------------- #
# discover: mapping + read_only fail-safe
# --------------------------------------------------------------------------- #
def test_discover_maps_tools_and_read_only_failsafe() -> None:
    session = FakeSession(
        tools=[
            _tool("ro_true", read_only_hint=True, schema={"type": "object"}),
            _tool("ro_false", read_only_hint=False),
            _tool("ro_absent", read_only_hint="absent"),
            _tool("ro_none", read_only_hint=None),
        ]
    )
    transports = {"s1": FakeTransport(session)}
    client = McpClient([_cfg("s1")], transport_factory=_factory(transports))

    async def run() -> list[Any]:
        await client.start()
        return await client.discover()

    tools = asyncio.run(run())
    by_name = {t.name: t for t in tools}

    assert by_name["ro_true"].read_only is True
    assert by_name["ro_true"].server_id == "s1"
    assert by_name["ro_true"].input_schema == {"type": "object"}
    # Fail-safe: false / absent / None hint all resolve to False.
    assert by_name["ro_false"].read_only is False
    assert by_name["ro_absent"].read_only is False
    assert by_name["ro_none"].read_only is False
    # inputSchema None -> {}.
    assert by_name["ro_absent"].input_schema == {}


# --------------------------------------------------------------------------- #
# call_tool
# --------------------------------------------------------------------------- #
def test_call_tool_joins_text_parts() -> None:
    result = SimpleNamespace(
        isError=False,
        content=[
            _text_part("hello "),
            SimpleNamespace(type="image"),
            _text_part("world"),
        ],
    )
    transports = {"s1": FakeTransport(FakeSession(call_result=result))}
    client = McpClient([_cfg("s1")], transport_factory=_factory(transports))

    async def run() -> str:
        await client.start()
        return await client.call_tool("s1", "t", {})

    assert asyncio.run(run()) == "hello world"


def test_call_tool_timeout_maps_to_mcp_timeout() -> None:
    session = FakeSession(
        call_result=SimpleNamespace(isError=False, content=[]), call_delay=1.0
    )
    transports = {"s1": FakeTransport(session)}
    # Tiny outer timeout so the fake call is guaranteed to exceed it.
    client = McpClient(
        [_cfg("s1")], timeout=0.01, transport_factory=_factory(transports)
    )

    async def run() -> None:
        await client.start()
        await client.call_tool("s1", "t", {})

    with pytest.raises(McpToolError) as exc:
        asyncio.run(run())
    assert exc.value.code == MCP_TIMEOUT


def test_call_tool_is_error_maps_to_mcp_error() -> None:
    result = SimpleNamespace(isError=True, content=[_text_part("boom")])
    transports = {"s1": FakeTransport(FakeSession(call_result=result))}
    client = McpClient([_cfg("s1")], transport_factory=_factory(transports))

    async def run() -> None:
        await client.start()
        await client.call_tool("s1", "t", {})

    with pytest.raises(McpToolError) as exc:
        asyncio.run(run())
    assert exc.value.code == MCP_ERROR


def test_call_tool_unknown_server_maps_to_unavailable() -> None:
    client = McpClient([], transport_factory=_factory({}))

    async def run() -> None:
        await client.start()
        await client.call_tool("nope", "t", {})

    with pytest.raises(McpToolError) as exc:
        asyncio.run(run())
    assert exc.value.code == MCP_UNAVAILABLE


def test_call_tool_transport_failure_maps_to_unavailable() -> None:
    session = FakeSession(call_exc=RuntimeError("connection reset"))
    transports = {"s1": FakeTransport(session)}
    client = McpClient([_cfg("s1")], transport_factory=_factory(transports))

    async def run() -> None:
        await client.start()
        await client.call_tool("s1", "t", {})

    with pytest.raises(McpToolError) as exc:
        asyncio.run(run())
    assert exc.value.code == MCP_UNAVAILABLE


def test_call_tool_respects_smaller_server_timeout() -> None:
    session = FakeSession(
        call_result=SimpleNamespace(isError=False, content=[]), call_delay=1.0
    )
    transports = {"s1": FakeTransport(session)}
    # Outer budget is large, but the server's own timeout is tiny -> smaller wins.
    client = McpClient(
        [_cfg("s1", timeout=0.01)], timeout=10.0, transport_factory=_factory(transports)
    )

    async def run() -> None:
        await client.start()
        await client.call_tool("s1", "t", {})

    with pytest.raises(McpToolError) as exc:
        asyncio.run(run())
    assert exc.value.code == MCP_TIMEOUT


# --------------------------------------------------------------------------- #
# start(): a failing server is skipped without breaking others
# --------------------------------------------------------------------------- #
def test_start_skips_failing_server_keeps_others() -> None:
    good = FakeTransport(FakeSession(tools=[_tool("ok", read_only_hint=True)]))
    bad = FakeTransport(None, open_exc=RuntimeError("spawn failed"))
    transports = {"good": good, "bad": bad}
    client = McpClient(
        [_cfg("bad"), _cfg("good")], transport_factory=_factory(transports)
    )

    async def run() -> list[Any]:
        await client.start()
        return await client.discover()

    tools = asyncio.run(run())
    # The good server still works; the bad one is isolated.
    assert [t.name for t in tools] == ["ok"]
    # Failed open triggers a best-effort close on the partial transport.
    assert bad.closed == 1


# --------------------------------------------------------------------------- #
# aclose(): idempotent + closes all
# --------------------------------------------------------------------------- #
def test_aclose_is_idempotent_and_closes_all() -> None:
    t1 = FakeTransport(FakeSession())
    t2 = FakeTransport(FakeSession())
    transports = {"a": t1, "b": t2}
    client = McpClient([_cfg("a"), _cfg("b")], transport_factory=_factory(transports))

    async def run() -> None:
        await client.start()
        await client.aclose()
        await client.aclose()  # second call must be a no-op, not an error.

    asyncio.run(run())
    assert t1.closed == 1
    assert t2.closed == 1


# --------------------------------------------------------------------------- #
# transport unit bits: auth headers + factory + no real I/O in open()
# --------------------------------------------------------------------------- #
def test_auth_headers_bearer_header_and_none() -> None:
    from app.ai.mcp.config import McpAuthConfig

    assert _auth_headers(McpAuthConfig(type="bearer", token="abc")) == {
        "Authorization": "Bearer abc"
    }
    assert _auth_headers(
        McpAuthConfig(type="header", header_name="X-Api-Key", token="k")
    ) == {"X-Api-Key": "k"}
    assert _auth_headers(McpAuthConfig(type="none")) == {}
    # Missing token -> no header (fail closed, no malformed auth).
    assert _auth_headers(McpAuthConfig(type="bearer")) == {}


def test_build_transport_branches_on_kind() -> None:
    stdio = build_transport(_cfg("s"))
    assert isinstance(stdio, StdioTransport)
    http_cfg = McpServerConfig(
        id="h", transport=McpTransportKind.HTTP, url="https://example.test/mcp"
    )
    assert isinstance(build_transport(http_cfg), HttpTransport)


def test_join_text_ignores_non_text_and_non_list() -> None:
    assert (
        _join_text([_text_part("a"), SimpleNamespace(type="image"), _text_part("b")])
        == "ab"
    )
    assert _join_text(None) == ""
