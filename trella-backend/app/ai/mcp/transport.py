"""MCP transports (Phase 10.1, Agent A).

One :class:`~app.ai.mcp.contracts.McpTransport` subclass per SDK transport kind.
Each is built from a single :class:`~app.ai.mcp.config.McpServerConfig` and keeps
the SDK's nested async context managers (``stdio_client``/``streamablehttp_client``
plus the ``ClientSession``) alive across ``open()`` -> ``close()`` via an
:class:`contextlib.AsyncExitStack`.

Adding a new transport later = a new subclass + a new ``build_transport`` branch;
nothing else changes.
"""

from __future__ import annotations

import logging
from contextlib import AsyncExitStack

from anyio.streams.memory import MemoryObjectReceiveStream, MemoryObjectSendStream
from mcp import ClientSession
from mcp.client.stdio import StdioServerParameters, stdio_client
from mcp.client.streamable_http import streamablehttp_client
from mcp.shared.message import SessionMessage

from app.ai.mcp.config import McpAuthConfig, McpServerConfig, McpTransportKind
from app.ai.mcp.contracts import McpTransport

logger = logging.getLogger("app.ai")

# The opaque stream pair the SDK transports yield and ClientSession consumes.
_ReadStream = MemoryObjectReceiveStream["SessionMessage | Exception"]
_WriteStream = MemoryObjectSendStream[SessionMessage]
_Streams = tuple[_ReadStream, _WriteStream]


def _auth_headers(auth: McpAuthConfig) -> dict[str, str]:
    """Build HTTP headers from operator-provided auth (never from the model).

    ``bearer`` -> ``Authorization: Bearer <token>``; ``header`` ->
    ``{header_name: token}``; ``none`` (or missing pieces) -> no header.
    """
    if auth.type == "bearer" and auth.token:
        return {"Authorization": f"Bearer {auth.token}"}
    if auth.type == "header" and auth.header_name and auth.token:
        return {auth.header_name: auth.token}
    return {}


class _ExitStackTransport(McpTransport):
    """Shared open/close plumbing: enter SDK managers, initialize, expose session.

    Subclasses only provide ``_enter_streams`` (the transport-specific read/write
    pair). The read/write streams the SDK yields are opaque here; we forward them
    to ``ClientSession`` verbatim.
    """

    def __init__(self, cfg: McpServerConfig) -> None:
        self._cfg = cfg
        self._stack: AsyncExitStack | None = None
        self._session: ClientSession | None = None

    async def _enter_streams(self, stack: AsyncExitStack) -> _Streams:
        """Enter the transport CM and return its ``(read, write)`` streams."""
        raise NotImplementedError

    async def open(self) -> ClientSession:
        if self._session is not None:
            return self._session
        stack = AsyncExitStack()
        try:
            read, write = await self._enter_streams(stack)
            session = await stack.enter_async_context(ClientSession(read, write))
            await session.initialize()
        except BaseException:
            # Roll back anything we managed to enter so a failed open leaks nothing.
            await stack.aclose()
            raise
        self._stack = stack
        self._session = session
        return session

    async def close(self) -> None:
        stack, self._stack, self._session = self._stack, None, None
        if stack is not None:
            await stack.aclose()


class StdioTransport(_ExitStackTransport):
    """Spawn a local MCP server over stdio."""

    async def _enter_streams(self, stack: AsyncExitStack) -> _Streams:
        cfg = self._cfg
        # Validated by McpServerConfig; assert keeps mypy + reality honest.
        assert cfg.command is not None
        params = StdioServerParameters(
            command=cfg.command, args=cfg.args, env=cfg.env or None
        )
        read, write = await stack.enter_async_context(stdio_client(params))
        return read, write


class HttpTransport(_ExitStackTransport):
    """Connect to a remote MCP server over Streamable HTTP."""

    async def _enter_streams(self, stack: AsyncExitStack) -> _Streams:
        cfg = self._cfg
        assert cfg.url is not None
        headers = _auth_headers(cfg.auth)
        # streamablehttp_client yields (read, write, get_session_id); we only
        # need the stream pair for ClientSession.
        read, write, _get_session_id = await stack.enter_async_context(
            streamablehttp_client(cfg.url, headers=headers or None, timeout=cfg.timeout)
        )
        return read, write


def build_transport(cfg: McpServerConfig) -> McpTransport:
    """Factory: pick the transport subclass for ``cfg.transport``."""
    if cfg.transport is McpTransportKind.STDIO:
        return StdioTransport(cfg)
    if cfg.transport is McpTransportKind.HTTP:
        return HttpTransport(cfg)
    # Enum is exhaustive today; guard keeps a future kind from silently no-op'ing.
    raise ValueError(f"Unsupported MCP transport: {cfg.transport!r}")
