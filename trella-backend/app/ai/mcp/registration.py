"""MCP tool registration (Phase 10.1, Agent B).

Discovers remote tools via the FROZEN ``McpClientProtocol`` and registers the
allowed ones into the :class:`~app.ai.tools.registry.ToolRegistry` as
:class:`~app.ai.mcp.adapter.McpToolAdapter` instances.

Registration policy:
* EMPTY ``capabilities`` (fail-safe default): register ONLY read-only tools — an
  unknown-mutation tool (``read_only is False``) is never registered.
* NON-EMPTY ``capabilities`` (explicit operator allow-list): register exactly the
  named tools. Naming a tool is an explicit operator authorization — it covers
  genuinely-read-only tools whose server simply omits the ``readOnlyHint``
  annotation (e.g. ``mcp-server-fetch``'s ``fetch``). The operator vouches for
  the tools they list; a tool NOT in a non-empty list is always skipped.
"""

from __future__ import annotations

import logging

from app.ai.mcp.adapter import McpToolAdapter
from app.ai.mcp.config import McpServerConfig
from app.ai.mcp.contracts import McpClientProtocol, RegistrationSummary
from app.ai.tools.registry import ToolRegistry

_log = logging.getLogger("app.ai")


async def register_mcp_tools(
    registry: ToolRegistry,
    client: McpClientProtocol,
    servers: list[McpServerConfig],
) -> RegistrationSummary:
    """Register allow-listed MCP tools; return a summary.

    Gate: an EMPTY server ``capabilities`` falls back to read-only-only (an
    unknown-mutation tool is never registered). A NON-EMPTY ``capabilities`` is
    an explicit operator authorization — exactly the named tools register
    (covering genuinely-read-only tools the server didn't annotate). A tool not
    in a non-empty list is always skipped. Duplicate registry names are skipped
    rather than overwriting an existing tool.
    """
    by_server = {s.id: s for s in servers}
    registered: list[str] = []
    skipped: list[str] = []

    for tool in await client.discover():
        adapter = McpToolAdapter(tool, client)
        spec_name = adapter.spec.name
        server = by_server.get(tool.server_id)
        allow = server.capabilities if server is not None else []
        # Explicit allow-list authorizes exactly its tools; otherwise fail-safe
        # to read-only-only. Never auto-register an unannotated tool without an
        # explicit operator opt-in.
        allowed = tool.name in allow if allow else tool.read_only is True
        if not allowed or registry.has(spec_name):
            skipped.append(spec_name)
            continue
        registry.register(adapter)
        registered.append(spec_name)

    # Best-effort audit: a one-line summary of the outcome.
    _log.info(
        "MCP registration: registered %d, skipped %d", len(registered), len(skipped)
    )
    return RegistrationSummary(registered=registered, skipped=skipped)
