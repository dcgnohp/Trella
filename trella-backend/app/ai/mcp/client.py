"""MCP client (Phase 10.1, Agent A).

Owns the live sessions for every allow-listed server and implements
:class:`~app.ai.mcp.contracts.McpClientProtocol`. It is the isolation boundary:
one dead/slow server never breaks discovery or another server's call, and every
failure is mapped to a stable code from :mod:`app.ai.mcp.errors` (SDK/transport
detail is logged server-side, never surfaced to the model).
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from mcp import ClientSession

from app.ai.mcp.config import McpServerConfig
from app.ai.mcp.contracts import DiscoveredTool, McpTransport
from app.ai.mcp.errors import (
    MCP_ERROR,
    MCP_TIMEOUT,
    MCP_UNAVAILABLE,
    McpToolError,
)
from app.ai.mcp.transport import build_transport
from app.core.config import settings

logger = logging.getLogger("app.ai")

TransportFactory = Callable[[McpServerConfig], McpTransport]


@dataclass
class _Connection:
    """A connected server: its config, transport, and live session."""

    cfg: McpServerConfig
    transport: McpTransport
    session: ClientSession


class McpClient:
    """Manage sessions across allow-listed MCP servers (read-only in Phase 10.1)."""

    def __init__(
        self,
        servers: list[McpServerConfig],
        *,
        timeout: float | None = None,
        transport_factory: TransportFactory = build_transport,
    ) -> None:
        self._servers = servers
        # Outer per-call budget; a server's own smaller timeout still wins.
        self._timeout = (
            timeout if timeout is not None else settings.AI_MCP_TOOL_TIMEOUT_S
        )
        self._transport_factory = transport_factory
        self._conns: dict[str, _Connection] = {}

    async def start(self) -> None:
        """Connect + initialize every server; a bad server is logged and SKIPPED.

        Binds to the current running event loop (the SDK sessions are loop-bound).
        """
        for cfg in self._servers:
            if cfg.id in self._conns:
                continue
            transport = self._transport_factory(cfg)
            try:
                session = await transport.open()
            except Exception:
                # Isolate a dead server: never raise across server boundaries.
                logger.warning(
                    "MCP server %r failed to connect; skipping", cfg.id, exc_info=True
                )
                # Best-effort cleanup of a partially-opened transport.
                try:
                    await transport.close()
                except Exception:
                    logger.debug(
                        "MCP server %r close-after-failed-open errored",
                        cfg.id,
                        exc_info=True,
                    )
                continue
            self._conns[cfg.id] = _Connection(
                cfg=cfg, transport=transport, session=session
            )

    async def discover(self) -> list[DiscoveredTool]:
        """List tools across connected servers; a failing server is skipped."""
        tools: list[DiscoveredTool] = []
        for server_id, conn in self._conns.items():
            try:
                resp = await conn.session.list_tools()
            except Exception:
                logger.warning(
                    "MCP discover failed for server %r; skipping",
                    server_id,
                    exc_info=True,
                )
                continue
            for tool in resp.tools:
                annotations = getattr(tool, "annotations", None)
                # FAIL-SAFE: absent hint -> False (unknown-mutation tools not read-only).
                read_only = bool(annotations and annotations.readOnlyHint)
                tools.append(
                    DiscoveredTool(
                        server_id=server_id,
                        name=tool.name,
                        description=tool.description or "",
                        input_schema=tool.inputSchema or {},
                        read_only=read_only,
                    )
                )
        return tools

    async def call_tool(
        self, server_id: str, name: str, arguments: dict[str, Any]
    ) -> str:
        """Invoke a remote tool and return its text result.

        Failures map to stable codes: unknown server / connection loss ->
        ``MCP_UNAVAILABLE``; timeout -> ``MCP_TIMEOUT``; tool-level error ->
        ``MCP_ERROR``. The real cause is logged, never leaked in the message.
        """
        conn = self._conns.get(server_id)
        if conn is None:
            logger.warning("MCP call_tool for unknown/unconnected server %r", server_id)
            raise McpToolError(MCP_UNAVAILABLE)

        # Smaller of the outer budget and the server's own timeout wins.
        timeout = min(conn.cfg.timeout, self._timeout)
        try:
            result = await asyncio.wait_for(
                conn.session.call_tool(name, arguments), timeout=timeout
            )
        except (TimeoutError, asyncio.TimeoutError):
            logger.warning(
                "MCP call_tool %r/%r timed out after %ss", server_id, name, timeout
            )
            raise McpToolError(MCP_TIMEOUT)
        except McpToolError:
            raise
        except Exception:
            logger.warning(
                "MCP call_tool %r/%r transport failure", server_id, name, exc_info=True
            )
            raise McpToolError(MCP_UNAVAILABLE)

        if result.isError:
            logger.warning("MCP tool %r/%r returned an error result", server_id, name)
            raise McpToolError(MCP_ERROR)

        return _join_text(result.content)

    async def aclose(self) -> None:
        """Close every session. Best-effort and idempotent."""
        for server_id, conn in list(self._conns.items()):
            try:
                await conn.transport.close()
            except Exception:
                logger.debug("MCP server %r close errored", server_id, exc_info=True)
            self._conns.pop(server_id, None)


def _join_text(content: object) -> str:
    """Join the text parts of a ``CallToolResult.content`` list into one string.

    Non-text parts (images, embedded resources) are ignored in Phase 10.1.
    ponytail: text-only projection; ceiling = binary/resource parts dropped,
    upgrade path = render other part kinds when a tool needs them.
    """
    if not isinstance(content, list):
        return ""
    parts = [part.text for part in content if getattr(part, "type", None) == "text"]
    return "".join(parts)
