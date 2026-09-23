"""Ephemeral store of PROPOSED write actions for the agent workflow (Phase 8).

Phase 8 uses a Propose → Approve → Execute model. During a chat turn the
Reasoning Engine collects PROPOSED write actions (it does NOT execute them).
Those proposals are parked here, keyed by a ``plan_id``, so a later
``POST /ai/actions/execute`` call can load them by ``plan_id`` and run only the
approved ones. This is NOT the database and NOT conversation persistence.

Mirrors :class:`~app.ai.reasoning.session_memory.SessionMemory`: a thin wrapper
over :class:`~app.ai.utils.cache.TTLCache` so plans auto-expire and the LRU
entry is evicted once full.

ponytail: per-process TTLCache (mirrors SessionMemory). Ceiling: not shared
across workers, reset on restart. Upgrade path = Redis behind the same API.
"""

from __future__ import annotations

import time
import uuid
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

from app.ai.utils.cache import TTLCache


@dataclass(frozen=True)
class ActionProposal:
    """A single PROPOSED write action, replayable at execute time."""

    action_id: str  # uuid4 hex, unique within a plan
    tool_name: str  # the write tool's spec.name
    args: dict[str, Any]  # normalized/validated args to replay at execute time
    preview: str  # human-readable, e.g. "Create task 'Fix login' in Sprint 11"
    capabilities: frozenset[str]  # from the tool's spec.capabilities
    scope: dict[str, str]  # ids for audit/display, e.g. {"workspace_id": "..."}
    permission_status: str = "allowed"  # "allowed" | "not_authorized"


@dataclass
class ActionPlan:
    """A set of proposals produced by one chat turn, awaiting approval."""

    plan_id: str  # uuid4 hex
    proposals: list[ActionProposal] = field(default_factory=list)


class ActionPlanStore:
    """In-memory, TTL-backed store of pending ActionPlans.

    ponytail: per-process TTLCache (mirrors SessionMemory). Ceiling: not shared
    across workers, reset on restart. Upgrade path = Redis behind the same API.
    """

    def __init__(
        self,
        ttl_s: float = 600.0,
        maxsize: int = 512,
        time_fn: Callable[[], float] = time.monotonic,
    ) -> None:
        self._cache: TTLCache = TTLCache(maxsize=maxsize, ttl_s=ttl_s, time_fn=time_fn)

    def create(self, proposals: list[ActionProposal]) -> ActionPlan:
        """Create a plan with a fresh plan_id, store it (TTL), return it."""
        plan = ActionPlan(plan_id=uuid.uuid4().hex, proposals=proposals)
        self._cache.set(plan.plan_id, plan)
        return plan

    def get(self, plan_id: str) -> ActionPlan | None:
        """Return the plan, or ``None`` if unknown/expired."""
        plan = self._cache.get(plan_id)
        return plan if isinstance(plan, ActionPlan) else None


# Module-level default store shared across the AI platform (mirrors the
# ``get_session_memory`` / ``get_tool_registry`` accessor pattern).
_default_store = ActionPlanStore()


def get_action_plan_store() -> ActionPlanStore:
    """Accessor for the process-wide default action-plan store."""
    return _default_store
