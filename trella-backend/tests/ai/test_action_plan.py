"""Tests for the ephemeral action-plan store (Phase 8).

No DB. Uses an injected clock so TTL expiry is deterministic without sleeping
(mirrors ``tests/ai/test_session_memory.py``).
"""

from __future__ import annotations

from app.ai.agent.action_plan import (
    ActionPlan,
    ActionPlanStore,
    ActionProposal,
    get_action_plan_store,
)


class _Clock:
    """Manually advanced monotonic clock for deterministic TTL tests."""

    def __init__(self) -> None:
        self.now = 0.0

    def __call__(self) -> float:
        return self.now


def _proposal(preview: str = "Create task 'Fix login' in Sprint 11") -> ActionProposal:
    return ActionProposal(
        action_id="a1",
        tool_name="create_task",
        args={"title": "Fix login", "sprint_id": "11"},
        preview=preview,
        capabilities=frozenset({"write"}),
        scope={"workspace_id": "ws-1", "project_id": "proj-1"},
    )


def test_create_then_get_returns_same_plan() -> None:
    store = ActionPlanStore()
    proposals = [_proposal()]
    plan = store.create(proposals)

    assert isinstance(plan, ActionPlan)
    assert plan.plan_id  # non-empty
    assert plan.proposals == proposals
    assert store.get(plan.plan_id) is plan


def test_get_unknown_plan_id_returns_none() -> None:
    store = ActionPlanStore()
    assert store.get("does-not-exist") is None


def test_ttl_expiry_via_injected_clock() -> None:
    clock = _Clock()
    store = ActionPlanStore(ttl_s=10.0, time_fn=clock)
    plan = store.create([_proposal()])

    clock.now = 9.999
    assert store.get(plan.plan_id) is plan  # still live

    clock.now = 10.0
    assert store.get(plan.plan_id) is None  # expired at ttl


def test_get_action_plan_store_is_stable() -> None:
    assert get_action_plan_store() is get_action_plan_store()
