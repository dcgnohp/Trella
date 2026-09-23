"""MCP allow-list configuration (Phase 10.1).

Servers are declared ONLY in an external allow-list file (mcp.json-style) — never
hardcoded. Shape (either is accepted)::

    {"mcpServers": {"<id>": {"transport": "stdio", "command": "...", ...}}}

or a top-level list of server objects. Only ``enabled`` servers are returned.
"""

from __future__ import annotations

import json
from enum import Enum
from pathlib import Path
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, model_validator

from app.ai.mcp.errors import McpConfigError


class McpTransportKind(str, Enum):
    STDIO = "stdio"
    HTTP = "http"  # Streamable HTTP


class McpAuthConfig(BaseModel):
    """Per-server auth for HTTP transports (operator-provided; never from the model)."""

    model_config = ConfigDict(extra="forbid")

    type: Literal["none", "bearer", "header"] = "none"
    token: str | None = None
    header_name: str | None = None


class McpServerConfig(BaseModel):
    """One allow-listed MCP server."""

    model_config = ConfigDict(extra="forbid")

    id: str
    transport: McpTransportKind
    command: str | None = None  # stdio
    args: list[str] = []
    env: dict[str, str] = {}
    url: str | None = None  # http
    auth: McpAuthConfig = McpAuthConfig()
    timeout: float = 30.0
    enabled: bool = True
    # Allow-list of tool names permitted from this server. EMPTY = allow all
    # (still filtered to READ-ONLY at registration).
    capabilities: list[str] = []

    @model_validator(mode="after")
    def _check_transport_fields(self) -> McpServerConfig:
        if self.transport is McpTransportKind.STDIO and not self.command:
            raise ValueError(
                f"MCP server {self.id!r}: stdio transport requires 'command'"
            )
        if self.transport is McpTransportKind.HTTP and not self.url:
            raise ValueError(f"MCP server {self.id!r}: http transport requires 'url'")
        return self


def _coerce_entries(raw: Any) -> list[dict[str, Any]]:
    """Accept ``{"mcpServers": {id: {...}}}`` or a list of server dicts."""
    if isinstance(raw, dict) and "mcpServers" in raw:
        servers = raw["mcpServers"]
        if not isinstance(servers, dict):
            raise McpConfigError("'mcpServers' must be an object")
        return [{"id": sid, **cfg} for sid, cfg in servers.items()]
    if isinstance(raw, list):
        return list(raw)
    raise McpConfigError("MCP config must be a list or have an 'mcpServers' object")


def load_mcp_config(path: str | None) -> list[McpServerConfig]:
    """Load + validate enabled MCP servers from ``path``; ``[]`` if unset/missing.

    Raises :class:`McpConfigError` on malformed content (fail fast at startup).
    """
    if not path:
        return []
    p = Path(path)
    if not p.is_file():
        return []
    try:
        raw = json.loads(p.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise McpConfigError(f"Invalid JSON in MCP config {path!r}: {exc}") from exc
    try:
        servers = [McpServerConfig.model_validate(e) for e in _coerce_entries(raw)]
    except Exception as exc:  # noqa: BLE001 — surface any validation error as config error
        raise McpConfigError(f"Invalid MCP config {path!r}: {exc}") from exc
    # Duplicate ids would make tool namespacing ambiguous — reject.
    ids = [s.id for s in servers]
    if len(ids) != len(set(ids)):
        raise McpConfigError("Duplicate MCP server ids in config")
    return [s for s in servers if s.enabled]
