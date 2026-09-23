"""Frozen MCP contracts (Phase 10.1 W0).

These interfaces are FROZEN after W0 so the transport/client agent (A) and the
adapter/registration agent (B) implement against them in parallel without
touching each other's files. Do not change signatures without re-freezing.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Protocol, runtime_checkable

from mcp import ClientSession


@dataclass(frozen=True)
class DiscoveredTool:
    """SDK-agnostic projection of one remote MCP tool.

    ``read_only`` is derived from the MCP ``annotations.readOnlyHint`` with a
    FAIL-SAFE default of ``False`` when the hint is absent (so unknown-mutation
    tools are NOT registered in Phase 10.1).
    """

    server_id: str
    name: str
    description: str
    input_schema: dict[str, Any]
    read_only: bool


@dataclass(frozen=True)
class RegistrationSummary:
    """Outcome of registering MCP tools into the Tool Registry."""

    registered: list[str] = field(default_factory=list)
    skipped: list[str] = field(default_factory=list)


class McpTransport(ABC):
    """Opens/closes a live ``ClientSession`` for ONE server.

    Adding a new transport later = a new subclass + a factory branch; nothing
    else changes. Implemented by Agent A (``transport.py``).
    """

    @abstractmethod
    async def open(self) -> ClientSession:
        """Establish + initialize a session (bound to the app event loop)."""

    @abstractmethod
    async def close(self) -> None:
        """Tear down the session/transport. Best-effort, idempotent."""


@runtime_checkable
class McpClientProtocol(Protocol):
    """What the adapter/registration (Agent B) depend on.

    Implemented by Agent A (``client.py``). All methods are async and run on the
    app event loop. Implementations isolate a dead server (never raise across
    server boundaries) and map failures to the codes in ``errors.py``.
    """

    async def start(self) -> None:
        """Connect + initialize every enabled server. Never raises for one bad server."""
        ...

    async def discover(self) -> list[DiscoveredTool]:
        """List tools across all connected servers as ``DiscoveredTool`` items."""
        ...

    async def call_tool(
        self, server_id: str, name: str, arguments: dict[str, Any]
    ) -> str:
        """Invoke a remote tool; return its result as a (bounded) text string.

        Raises a mapped ``Mcp*`` failure the caller folds into ``ToolResult``.
        """
        ...

    async def aclose(self) -> None:
        """Close all sessions. Best-effort, idempotent."""
        ...
