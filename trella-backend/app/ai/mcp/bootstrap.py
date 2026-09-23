"""MCP startup/shutdown integration (Phase 10.1, orchestrator-owned).

Composes the pieces built in parallel — config loader, ``McpClient`` (Agent A),
and ``register_mcp_tools`` (Agent B) — into the app lifecycle. Called from
``app.main`` startup/shutdown, guarded by ``AI_MCP_ENABLED`` (default OFF), so
default behavior is unchanged.

Read-only only (Phase 10.1): the registration step filters to read-only tools;
nothing here bypasses the Write-Agent path.
"""

from __future__ import annotations

import logging

from app.ai.mcp.client import McpClient
from app.ai.mcp.config import load_mcp_config
from app.ai.mcp.registration import register_mcp_tools
from app.ai.tools.registry import get_tool_registry
from app.core.config import settings

logger = logging.getLogger("app.ai")

# Process-wide handle so shutdown can close the sessions started at boot.
_client: McpClient | None = None


async def start_mcp() -> None:
    """Connect enabled MCP servers + register their read-only tools. No-op when
    disabled, unconfigured, or when no enabled servers are present."""
    global _client
    if not settings.AI_MCP_ENABLED:
        return
    servers = load_mcp_config(settings.AI_MCP_CONFIG_PATH)
    if not servers:
        logger.info("MCP enabled but no enabled servers configured; skipping.")
        return
    client = McpClient(servers)
    await client.start()
    summary = await register_mcp_tools(get_tool_registry(), client, servers)
    _client = client
    logger.info(
        "MCP startup: %d tools registered, %d skipped",
        len(summary.registered),
        len(summary.skipped),
    )


async def stop_mcp() -> None:
    """Close all MCP sessions started at boot. Best-effort, idempotent."""
    global _client
    if _client is not None:
        await _client.aclose()
        _client = None
