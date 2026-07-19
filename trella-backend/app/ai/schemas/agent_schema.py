"""Agent workflow schemas (Phase 8) — approve + execute proposed writes.

Data contracts for ``POST /ai/actions/execute``. The reasoning loop only
*proposes* write actions (parked in an ``ActionPlan``); this endpoint approves
and runs them. Extends :class:`CamelModel` so the API speaks camelCase on the
wire (``actionId``, ``toolName``, ...) while accepting snake_case internally,
matching the other AI schemas. Pure data — no business logic here.
"""

from __future__ import annotations

from uuid import UUID

from pydantic import Field

from app.core.base import CamelModel


class ExecuteActionsRequest(CamelModel):
    """Which plan to run and which of its proposals were approved."""

    plan_id: str
    approved_action_ids: list[str] = Field(default_factory=list)
    approve_all: bool = False
    workspace_id: UUID | None = None


class ActionResultOut(CamelModel):
    """Outcome of one attempted (or skipped) action, safe to return."""

    action_id: str
    tool_name: str
    ok: bool
    status: str
    summary: str | None = None
    error: str | None = None


class ExecuteActionsResponse(CamelModel):
    """One result per proposal in the plan, in plan order."""

    results: list[ActionResultOut]
