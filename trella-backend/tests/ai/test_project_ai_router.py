"""Phase 5 check: project assistant AI endpoint via TestClient with overridden deps.

Mirrors ``tests/ai/test_docs_ai_router.py``: no network, no DB. The project
service and the auth dependency are overridden with fakes so the tests exercise
only routing, camelCase (de)serialization, and the AIError -> HTTP mapping.
"""

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from app.ai.context.base import ContextBuilder
from app.ai.routers.ai_router import get_project_service
from app.ai.schemas.project_ai_schema import ProjectAssistantResponse
from app.ai.schemas.sprint_ai_schema import RecommendationItem
from app.ai.utils.errors import AIError, InvalidPrompt
from app.core.deps import get_current_user
from app.main import app
from app.models.users_model import User


class _FakeProjectService:
    def __init__(
        self, result: ProjectAssistantResponse | None, exc: AIError | None = None
    ) -> None:
        self._result = result
        self._exc = exc

    async def assist(self, context: ContextBuilder) -> ProjectAssistantResponse:
        if self._exc is not None:
            raise self._exc
        assert self._result is not None
        return self._result


def _override_auth() -> None:
    app.dependency_overrides[get_current_user] = lambda: User(
        email="t@example.com", full_name="Tester"
    )


@pytest.fixture
def project_client() -> Iterator[TestClient]:
    result = ProjectAssistantResponse(
        health_summary="Project is healthy overall.",
        health_status="healthy",
        recommendations=[
            RecommendationItem(
                title="Keep momentum",
                priority="medium",
                confidence=0.7,
                expected_impact="Sustain delivery pace.",
                rationale="Trend is positive.",
            )
        ],
    )
    app.dependency_overrides[get_project_service] = lambda: _FakeProjectService(result)
    _override_auth()
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_project_assistant_ok(project_client: TestClient) -> None:
    resp = project_client.post(
        "/api/v1/ai/project/assistant",
        json={"name": "Trella", "totalTasks": 50, "doneTasks": 30},
    )
    assert resp.status_code == 200
    body = resp.json()
    # camelCase keys on the wire.
    assert body["healthSummary"] == "Project is healthy overall."
    assert body["healthStatus"] == "healthy"
    assert "suggestedNextActions" in body
    assert body["recommendations"][0]["expectedImpact"] == "Sustain delivery pace."


def test_project_assistant_maps_invalid_prompt_to_400() -> None:
    app.dependency_overrides[get_project_service] = lambda: _FakeProjectService(
        None, exc=InvalidPrompt("Not enough project data to analyze.")
    )
    _override_auth()
    resp = TestClient(app).post(
        "/api/v1/ai/project/assistant", json={"name": "x"}
    )
    assert resp.status_code == 400
    assert resp.json()["detail"]["code"] == "invalid_prompt"
    app.dependency_overrides.clear()


def test_project_assistant_requires_auth() -> None:
    resp = TestClient(app).post(
        "/api/v1/ai/project/assistant", json={"name": "x"}
    )
    assert resp.status_code == 401
