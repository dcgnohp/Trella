"""MCP tool adapter (Phase 10.1, Agent B).

Wraps ONE remote :class:`~app.ai.mcp.contracts.DiscoveredTool` as a first-class
read-only :class:`~app.ai.tools.base.Tool` so the Reasoning Engine/Executor can
plan over it exactly like a native tool -- they only ever see ``ToolSpec`` /
``ToolResult`` and never learn the tool came from MCP.

The adapter depends on the FROZEN ``McpClientProtocol`` (not the concrete
client). All untrusted values (model-supplied ``args`` and the remote result
text) cross a trust boundary here, so guardrails run BEFORE the call and the
result is truncated after it.
"""

from __future__ import annotations

import re
from typing import Any

from app.ai.mcp.contracts import DiscoveredTool, McpClientProtocol
from app.ai.mcp.errors import INVALID_ARGS, McpToolError
from app.ai.tools.base import Tool, ToolContext, ToolResult, ToolSpec

# Guardrails on the trust boundary. args are model-supplied; the result is an
# untrusted remote payload. Both are bounded so a hostile/broken server can't
# blow up the prompt or the response.
_MAX_ARGS_CHARS = 8000
_MAX_RESULT_CHARS = 4000

# Function-call-safe identifier characters; anything else becomes ``_``.
_UNSAFE_NAME_CHARS = re.compile(r"[^a-zA-Z0-9_]")


def mcp_tool_name(server_id: str, name: str) -> str:
    """Namespaced, snake_case, function-call-safe tool name for ``server_id``/``name``.

    Non-``[a-zA-Z0-9_]`` characters collapse to ``_`` and the result is
    lowercased so it is safe as a provider function-calling identifier.
    """
    raw = f"mcp_{server_id}_{name}"
    return _UNSAFE_NAME_CHARS.sub("_", raw).lower()


class McpToolAdapter(Tool):
    """Presents a remote MCP tool as a read-only native :class:`Tool`."""

    def __init__(self, tool: DiscoveredTool, client: McpClientProtocol) -> None:
        # Keep the ORIGINAL (un-namespaced) name + server_id to route the call
        # back through the client; the namespaced name is registry-facing only.
        self._server_id = tool.server_id
        self._original_name = tool.name
        self._client = client
        self.spec = ToolSpec(
            name=mcp_tool_name(tool.server_id, tool.name),
            description=tool.description,
            parameters=tool.input_schema or {"type": "object", "properties": {}},
            category="mcp",
            capability=f"mcp.{tool.server_id}.{tool.name}",
            capabilities=frozenset({"read"}),
            mutating=False,
        )

    async def run(self, args: dict[str, Any], ctx: ToolContext) -> ToolResult:
        source = f"mcp:{self._server_id}"
        # GUARDRAILS first -- validate untrusted args before touching the wire.
        if not isinstance(args, dict):
            return ToolResult(ok=False, error=INVALID_ARGS, source=source)
        # ponytail: len(str(args)) is an approximate size cap, not exact bytes.
        # Ceiling: repr overhead vs JSON; upgrade to len(json.dumps(args)) if an
        # exact serialized-byte budget is ever required.
        if len(str(args)) > _MAX_ARGS_CHARS:
            return ToolResult(ok=False, error=INVALID_ARGS, source=source)
        try:
            text = await self._client.call_tool(
                self._server_id, self._original_name, args
            )
        except McpToolError as exc:
            return ToolResult(ok=False, error=exc.code, source=source)
        # Truncate the untrusted remote payload before it reaches the model.
        return ToolResult(ok=True, content=text[:_MAX_RESULT_CHARS], source=source)
