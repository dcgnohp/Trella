"""MCP error codes (Phase 10.1).

Stable, machine-readable codes an MCP tool returns via ``ToolResult(ok=False,
error=<code>)`` — never leaking SDK/transport internals to the model or client
(those are logged server-side). Mirrors the executor's "fold every failure into
a code" guarantee from Phase 7.
"""

from __future__ import annotations

# Server unreachable / connect or transport failure.
MCP_UNAVAILABLE = "mcp_unavailable"
# The call exceeded its timeout budget.
MCP_TIMEOUT = "mcp_timeout"
# The MCP server/tool returned a protocol- or tool-level error.
MCP_ERROR = "mcp_error"
# Model-supplied arguments failed validation before the call.
INVALID_ARGS = "invalid_args"


class McpConfigError(RuntimeError):
    """Raised when the MCP allow-list config is malformed (fail fast at load)."""


class McpToolError(Exception):
    """A failed MCP tool call, carrying a stable ``code`` (one of the constants
    above). The client raises it; the adapter folds it into
    ``ToolResult(ok=False, error=code)`` — the SDK/transport message is logged
    server-side, never surfaced.
    """

    def __init__(self, code: str, message: str | None = None) -> None:
        self.code = code
        super().__init__(message or code)
