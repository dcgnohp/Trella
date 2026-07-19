"""Phase 5 check: sprint analysis AI endpoint via TestClient with overridden deps.

Mirrors ``tests/ai/test_docs_ai_router.py``: no network, no DB. The sprint
service and the auth dependency are overridden with fakes so the tests exercise
only routing, camelCase (de)serialization, and the AIError -> HTTP mapping.
"""

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from app.ai.context.base import ContextBuilder
from app.ai.routers.ai_router import get_sprint_service
from app.ai.schemas.sprint_ai_schema import (
    RecommendationItem,
    SprintAnalysisResponse,
    SprintHealth,
)
from app.ai.utils.errors import AIError, InvalidPrompt
from app.core.deps import get_current_user
from app.main import app
from app.models.users_model import User


class _FakeSprintService:
    def __init__(
        self, result: SprintAnalysisResponse | None, exc: AIError | None = None
    ) -> None:
        self._result = result
        self._exc = exc

    async def analyze(self, context: ContextBuilder) -> SprintAnalysisResponse:
        if self._exc is not None:
            raise self._exc
        assert self._result is not None
        return self._result


def _override_auth() -> None:
    app.dependency_overrides[get_current_user] = lambda: User(
        email="t@example.com", full_name="Tester"
    )


@pytest.fixture
def sprint_client() -> Iterator[TestClient]:
    result = SprintAnalysisResponse(
        executive_summary="Sprint is progressing well.",
        health=SprintHealth(status="on_track", score=80, rationale="Steady burn."),
        suggested_actions=[],
        recommendations=[
            RecommendationItem(
                title="Pair on blockers",
                priority="high",
                confidence=0.8,
                expected_impact="Unblock two tasks.",
                rationale="Blockers are stalling progress.",
            )
        ],
    )
    app.dependency_overrides[get_sprint_service] = lambda: _FakeSprintService(result)
    _override_auth()
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_sprint_analysis_ok(sprint_client: TestClient) -> None:
    resp = sprint_client.post(
        "/api/v1/ai/sprint/analysis",
        json={
            "goal": "Ship",
            "plannedPoints": 20,
            "completedPoints": 12,
            "doneCount": 6,
            "todoCount": 2,
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    # camelCase keys on the wire.
    assert body["executiveSummary"] == "Sprint is progressing well."
    assert body["health"]["status"] == "on_track"
    assert "suggestedActions" in body
    assert body["recommendations"][0]["expectedImpact"] == "Unblock two tasks."


def test_sprint_analysis_maps_invalid_prompt_to_400() -> None:
    app.dependency_overrides[get_sprint_service] = lambda: _FakeSprintService(
        None, exc=InvalidPrompt("Not enough sprint data to analyze.")
    )
    _override_auth()
    resp = TestClient(app).post("/api/v1/ai/sprint/analysis", json={"goal": "x"})
    assert resp.status_code == 400
    assert resp.json()["detail"]["code"] == "invalid_prompt"
    app.dependency_overrides.clear()


def test_sprint_analysis_requires_auth() -> None:
    resp = TestClient(app).post("/api/v1/ai/sprint/analysis", json={"goal": "x"})
    assert resp.status_code == 401
