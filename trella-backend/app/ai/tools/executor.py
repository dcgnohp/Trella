"""Tool executor (P7-B3): the single, safe entry point for running a tool.

The Reasoning Engine (B7) never calls a tool directly. It hands a tool *name*,
*args*, and a :class:`ToolContext` to :class:`ToolExecutor`, which resolves the
tool, runs a coarse permission gate, enforces a per-call timeout, and — most
importantly — converts *every* failure into a ``ToolResult(ok=False,
error=<code>)``. A failing tool therefore never breaks the reasoning loop; it
just yields a machine-readable error code the loop can reason about.
"""

from __future__ import annotations

import asyncio
from typing import Any

from fastapi import HTTPException, status

from app.ai.tools.base import ToolContext, ToolResult
from app.ai.tools.permissions import PermissionDenied, PermissionLayer
from app.ai.tools.registry import ToolRegistry, get_tool_registry

DEFAULT_TOOL_TIMEOUT_S: float = 10.0


def _error_from_http(err: HTTPException) -> str:
    """Map an ``HTTPException`` status to a stable tool error code.

    Only 403/404 are authorization outcomes; anything else is an unexpected
    business failure surfaced as the generic ``"tool_error"``. The ``.detail``
    is intentionally dropped so no internal prose leaks into the result.
    """
    if err.status_code == status.HTTP_403_FORBIDDEN:
        return "not_authorized"
    if err.status_code == status.HTTP_404_NOT_FOUND:
        return "not_found"
    return "tool_error"


class ToolExecutor:
    """Resolve, gate, time-bound, and run a tool, never raising to the caller."""

    def __init__(
        self,
        registry: ToolRegistry | None = None,
        permissions: PermissionLayer | None = None,
        timeout_s: float = DEFAULT_TOOL_TIMEOUT_S,
    ) -> None:
        self.registry = registry or get_tool_registry()
        self.permissions = permissions or PermissionLayer()
        self.timeout_s = timeout_s

    async def execute(
        self, name: str, args: dict[str, Any], ctx: ToolContext
    ) -> ToolResult:
        """Run tool ``name`` against ``args``/``ctx``, returning a ``ToolResult``.

        All failure modes are folded into ``ToolResult(ok=False, error=...)``:
        ``unknown_tool``, ``not_authorized``, ``not_found``, ``timeout``, or the
        generic ``tool_error``.
        """
        tool = self.registry.get(name)
        if tool is None:
            return ToolResult(ok=False, error="unknown_tool")

        # ponytail: per-conversation max-tool-calls guard lives in the Reasoning
        # Engine (B7), not here — the executor runs exactly one call.
        try:
            # Coarse workspace gate (defense-in-depth): the tool re-checks the
            # precise resource scope itself; this rejects obvious cross-tenant
            # calls before we even run.
            if ctx.workspace_id is not None:
                self.permissions.check_workspace(
                    ctx.session, ctx.user, ctx.workspace_id
                )

            result = await asyncio.wait_for(tool.run(args, ctx), timeout=self.timeout_s)
        except PermissionDenied as exc:
            return ToolResult(ok=False, error=exc.code)
        except HTTPException as exc:
            # A tool reaching business services may surface HTTP-shaped errors.
            return ToolResult(ok=False, error=_error_from_http(exc))
        except TimeoutError:
            return ToolResult(ok=False, error="timeout")
        except Exception:
            # ponytail: swallow the message to avoid leaking internals into the
            # result; upgrade path is structured telemetry/logging of the exc.
            return ToolResult(ok=False, error="tool_error")

        return result
