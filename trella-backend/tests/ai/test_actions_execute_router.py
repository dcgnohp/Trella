"""P8 check: approve+execute endpoint via TestClient with overridden deps.

Mirrors ``tests/ai/test_chat_router.py``: no network, no real DB. The auth
dependency and ``get_db`` are overridden with fakes, ``AI_AGENT_WRITE_ENABLED``
is flipped on per-test, and the Execution Engine is monkeypatched to a fake so
the tests exercise only routing, the write-enabled gate, plan lookup, and the
camelCase result contract — never a real tool or business write.
"""

from __future__ import annotations

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

import app.ai.routers.ai_router as ai_router_mod
from app.ai.agent.action_plan import ActionProposal, get_action_plan_store
from app.ai.agent.execution_engine import ActionResult
from app.core.db import get_db
from app.core.deps import get_current_user
from app.main import app
from app.models.users_model import User

_ENDPOINT = "/api/v1/ai/actions/execute"


def _override_auth() -> None:
    app.dependency_overrides[get_current_user] = lambda: User(
        email="t@example.com", full_name="Tester"
    )


def _override_db() -> None:
    # Stub session generator: the fake Execution Engine never touches it, so a
    # bare object is enough to satisfy the SessionDep dependency.
    app.dependency_overrides[get_db] = lambda: iter([object()])


def _seed_plan() -> str:
    """Park one proposal in the process-wide store; return its plan_id."""
    proposal = ActionProposal(
        action_id="a1",
        tool_name="create_task",
        args={"title": "Fix login"},
        preview="Create task 'Fix login'",
        capabilities=frozenset({"write"}),
        scope={"workspace_id": "w1"},
    )
    return get_action_plan_store().create([proposal]).plan_id


class _FakeExecutionEngine:
    """Returns a canned result list, bypassing the real registry/tools."""

    async def execute(self, plan, ctx, *, approved_action_ids=None, approve_all=False):  # type: ignore[no-untyped-def]
        return [
            ActionResult(
                action_id="a1",
                tool_name="create_task",
                ok=True,
                status="executed",
                summary="Created task 'Fix login'",
            )
        ]


@pytest.fixture
def client() -> Iterator[TestClient]:
    _override_auth()
    _override_db()
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_execute_requires_write_enabled(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(ai_router_mod.settings, "AI_AGENT_WRITE_ENABLED", False)
    resp = client.post(_ENDPOINT, json={"planId": "whatever", "approveAll": True})
    assert resp.status_code == 403


def test_execute_unknown_plan_404(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(ai_router_mod.settings, "AI_AGENT_WRITE_ENABLED", True)
    resp = client.post(_ENDPOINT, json={"planId": "does-not-exist", "approveAll": True})
    assert resp.status_code == 404


def test_execute_happy_path_returns_results(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(ai_router_mod.settings, "AI_AGENT_WRITE_ENABLED", True)
    monkeypatch.setattr(ai_router_mod, "ExecutionEngine", _FakeExecutionEngine)
    plan_id = _seed_plan()

    resp = client.post(_ENDPOINT, json={"planId": plan_id, "approvedActionIds": ["a1"]})
    assert resp.status_code == 200
    body = resp.json()
    assert body["results"] == [
        {
            "actionId": "a1",
            "toolName": "create_task",
            "ok": True,
            "status": "executed",
            "summary": "Created task 'Fix login'",
            "error": None,
        }
    ]


def test_execute_requires_auth(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(ai_router_mod.settings, "AI_AGENT_WRITE_ENABLED", True)
    # No auth override -> get_current_user rejects with 401.
    resp = TestClient(app).post(_ENDPOINT, json={"planId": "x", "approveAll": True})
    assert resp.status_code == 401
