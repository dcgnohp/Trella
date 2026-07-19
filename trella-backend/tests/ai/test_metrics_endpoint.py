"""P6-B6 checks: GET /api/v1/ai/metrics (superuser only).

Mirrors ``tests/ai/test_ai_router.py``: no network, no DB. ``get_current_user``
is overridden with fakes. Superuser -> 200 with the snapshot; a non-superuser
-> 403; no auth override -> 401.
"""

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from app.ai.telemetry.metrics import get_metrics_collector
from app.core.deps import get_current_user
from app.main import app
from app.models.users_model import User


def _superuser() -> User:
    return User(
        email="admin@example.com",
        full_name="Admin",
        is_superuser=True,
    )


def _regular_user() -> User:
    return User(
        email="user@example.com",
        full_name="User",
        is_superuser=False,
    )


@pytest.fixture
def client() -> Iterator[TestClient]:
    get_metrics_collector().reset()
    get_metrics_collector().record(
        feature="chat",
        provider="openai",
        model="gpt-4.1",
        success=True,
        latency_ms=100,
        cost=0.01,
        cache_decision="miss",
    )
    yield TestClient(app)
    app.dependency_overrides.clear()
    get_metrics_collector().reset()


def test_superuser_gets_snapshot(client: TestClient) -> None:
    app.dependency_overrides[get_current_user] = _superuser
    resp = client.get("/api/v1/ai/metrics")
    assert resp.status_code == 200
    body = resp.json()
    assert "chat:openai:gpt-4.1" in body["metrics"]["by_key"]
    assert body["metrics"]["by_key"]["chat:openai:gpt-4.1"]["requests"] == 1
    assert "recent_traces" in body


def test_non_superuser_forbidden(client: TestClient) -> None:
    app.dependency_overrides[get_current_user] = _regular_user
    resp = client.get("/api/v1/ai/metrics")
    assert resp.status_code == 403


def test_unauthenticated_rejected() -> None:
    resp = TestClient(app).get("/api/v1/ai/metrics")
    assert resp.status_code == 401
