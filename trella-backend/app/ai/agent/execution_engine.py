"""Execution Engine (Phase 8): runs the APPROVED writes of an ActionPlan.

Propose → Approve → **Execute**. The Reasoning Engine only *proposes* write
actions; this engine is invoked by the approval endpoint AFTER the user
approves, and NEVER during the reasoning loop.

For each proposal it: gates on approval, resolves the concrete ``WriteTool``,
calls ``apply`` (whose business service re-checks RBAC at execution time — the
propose-time ``permission_status`` is NOT trusted), folds every failure into a
machine code (never leaking internals), and best-effort writes an audit row.
A failing action never aborts the others — each runs independently.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass

from fastapi import HTTPException, status

from app.ai.agent.action_plan import ActionPlan, ActionProposal
from app.ai.tools.base import ToolContext, WriteTool
from app.ai.tools.permissions import PermissionDenied
from app.ai.tools.registry import ToolRegistry, get_tool_registry
from app.models.ai_action_audit_model import AiActionAudit
from app.repositories.ai_action_audit_repository import AiActionAuditRepository

logger = logging.getLogger("app.ai")

# Keep audit summaries tiny and non-sensitive.
_SUMMARY_MAX = 200


@dataclass(frozen=True)
class ActionResult:
    """Outcome of one attempted (or skipped) action, safe to return to callers."""

    action_id: str
    tool_name: str
    ok: bool
    status: str  # "executed" | "failed" | "denied" | "skipped" | "unknown_tool"
    summary: str | None = None
    error: str | None = None  # short machine code, never leaks internals


class ExecutionEngine:
    """Executes approved write actions of an ActionPlan, auditing each attempt."""

    def __init__(
        self,
        registry: ToolRegistry | None = None,
        audit_repo: AiActionAuditRepository | None = None,
    ) -> None:
        self.registry = registry or get_tool_registry()
        self.audit_repo = audit_repo or AiActionAuditRepository()

    async def execute(
        self,
        plan: ActionPlan,
        ctx: ToolContext,
        *,
        approved_action_ids: set[str] | None = None,
        approve_all: bool = False,
    ) -> list[ActionResult]:
        """Run the approved proposals in order, returning one result per proposal.

        Each action is independent: a failure/denial/unknown-tool for one never
        aborts the rest. Approval gate: an action runs only when ``approve_all``
        or its ``action_id`` is in ``approved_action_ids`` (which may be ``None``
        when ``approve_all`` is set).
        """
        approved = approved_action_ids or set()
        results: list[ActionResult] = []
        for proposal in plan.proposals:
            if not (approve_all or proposal.action_id in approved):
                results.append(
                    ActionResult(
                        action_id=proposal.action_id,
                        tool_name=proposal.tool_name,
                        ok=False,
                        status="skipped",
                    )
                )
                continue

            tool = self.registry.get(proposal.tool_name)
            if not isinstance(tool, WriteTool):
                # Unknown or non-write tool never ran -- no audit row.
                results.append(
                    ActionResult(
                        action_id=proposal.action_id,
                        tool_name=proposal.tool_name,
                        ok=False,
                        status="unknown_tool",
                        error="unknown_tool",
                    )
                )
                continue

            result = await self._run_one(proposal, tool, ctx)
            results.append(result)
            self._audit(proposal, ctx, result)
        return results

    async def _run_one(
        self, proposal: ActionProposal, tool: WriteTool, ctx: ToolContext
    ) -> ActionResult:
        """Call ``tool.apply`` with an execution-time permission re-check.

        Folds every failure into a stable machine code; ``.detail``/exception
        messages are never surfaced so no internals leak.
        """
        try:
            result = await tool.apply(proposal.args, ctx)
        except PermissionDenied as exc:
            return self._result(proposal, "denied", ok=False, error=exc.code)
        except HTTPException as exc:
            if exc.status_code == status.HTTP_403_FORBIDDEN:
                return self._result(
                    proposal, "denied", ok=False, error="not_authorized"
                )
            # Log the real cause server-side (e.g. 404 "Column not found") so
            # operators can diagnose; the client still gets only "tool_error".
            logger.warning(
                "action %s (%s) failed: HTTP %s %s",
                proposal.action_id,
                proposal.tool_name,
                exc.status_code,
                exc.detail,
            )
            return self._result(proposal, "failed", ok=False, error="tool_error")
        except Exception:
            # ponytail: swallow the message to the client to avoid leaking
            # internals, but log the full traceback server-side for diagnosis.
            logger.exception(
                "action %s (%s) failed with an unexpected error",
                proposal.action_id,
                proposal.tool_name,
            )
            return self._result(proposal, "failed", ok=False, error="tool_error")

        if result.ok:
            return self._result(
                proposal, "executed", ok=True, summary=_summary_of(result.content)
            )
        # Tool reported a clean failure via ToolResult.ok=False.
        return self._result(
            proposal, "failed", ok=False, error=result.error or "tool_error"
        )

    @staticmethod
    def _result(
        proposal: ActionProposal,
        status_: str,
        *,
        ok: bool,
        summary: str | None = None,
        error: str | None = None,
    ) -> ActionResult:
        return ActionResult(
            action_id=proposal.action_id,
            tool_name=proposal.tool_name,
            ok=ok,
            status=status_,
            summary=summary,
            error=error,
        )

    def _audit(
        self, proposal: ActionProposal, ctx: ToolContext, result: ActionResult
    ) -> None:
        """Best-effort audit of an attempted execution (executed/failed/denied).

        ponytail: an audit-write failure must never break the loop, so it is
        log-swallowed. Upgrade path = a durable outbox for guaranteed audit.
        """
        try:
            audit = AiActionAudit(
                user_id=ctx.user.id,
                workspace_id=ctx.workspace_id,
                tool_name=proposal.tool_name,
                args_json=json.dumps(proposal.args, default=str),
                preview=proposal.preview,
                status=result.status,
                result_summary=result.summary or result.error,
            )
            self.audit_repo.create(ctx.session, audit)
            ctx.session.commit()
        except Exception:
            logger.exception("audit write failed for action %s", proposal.action_id)


def _summary_of(content: object) -> str:
    """Tiny, non-sensitive summary of a tool result's content.

    Prefers a tool-supplied human ``message`` (execute is model-less, so this
    sentence is what the UI shows the user), else a truncated string form.
    """
    if isinstance(content, dict):
        message = content.get("message")
        if isinstance(message, str):
            return message[:_SUMMARY_MAX]
    return str(content)[:_SUMMARY_MAX]
