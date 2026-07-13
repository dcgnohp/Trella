"""P1-B8 check: task AI endpoints via TestClient with overridden deps.

Mirrors ``tests/ai/test_ai_router.py``: no network, no DB. The feature services
and the auth dependency are overridden with fakes so the tests exercise only
routing, camelCase (de)serialization, and the AIError -> HTTP mapping.
"""

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from app.ai.routers.ai_router import get_description_service, get_summary_service
from app.ai.schemas.task_ai_schema import (
    DescriptionResponse,
    GenerateDescriptionRequest,
    SummarizeRequest,
    SummaryResponse,
)
from app.ai.utils.errors import AIError, InvalidPrompt
from app.core.deps import get_current_user
from app.main import app
from app.models.users_model import User


class _FakeDescriptionService:
    def __init__(
        self, result: DescriptionResponse | None, exc: AIError | None = None
    ) -> None:
        self._result = result
        self._exc = exc

    async def generate(self, req: GenerateDescriptionRequest) -> DescriptionResponse:
        if self._exc is not None:
            raise self._exc
        assert self._result is not None
        return self._result


class _FakeSummaryService:
    def __init__(
        self, result: SummaryResponse | None, exc: AIError | None = None
    ) -> None:
        self._result = result
        self._exc = exc

    async def summarize(self, req: SummarizeRequest) -> SummaryResponse:
        if self._exc is not None:
            raise self._exc
        assert self._result is not None
        return self._result


def _override_auth() -> None:
    app.dependency_overrides[get_current_user] = lambda: User(
        email="t@example.com", full_name="Tester"
    )


@pytest.fixture
def desc_client() -> Iterator[TestClient]:
    result = DescriptionResponse(
        description="A structured description.",
        acceptance_criteria=["AC1", "AC2"],
        technical_notes=["TN1"],
        definition_of_done=["DoD1"],
    )
    app.dependency_overrides[get_description_service] = lambda: _FakeDescriptionService(
        result
    )
    _override_auth()
    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture
def summary_client() -> Iterator[TestClient]:
    result = SummaryResponse(
        summary="Short summary.",
        risks=["R1"],
        action_items=["Do this", "Do that"],
    )
    app.dependency_overrides[get_summary_service] = lambda: _FakeSummaryService(result)
    _override_auth()
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_generate_description_ok(desc_client: TestClient) -> None:
    resp = desc_client.post(
        "/api/v1/ai/tasks/generate-description", json={"title": "Add login"}
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["description"] == "A structured description."
    # camelCase keys on the wire.
    assert body["acceptanceCriteria"] == ["AC1", "AC2"]
    assert body["technicalNotes"] == ["TN1"]
    assert body["definitionOfDone"] == ["DoD1"]


def test_summarize_ok(summary_client: TestClient) -> None:
    resp = summary_client.post(
        "/api/v1/ai/tasks/summarize", json={"description": "A long description..."}
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["summary"] == "Short summary."
    assert body["risks"] == ["R1"]
    assert body["actionItems"] == ["Do this", "Do that"]


def test_generate_description_maps_invalid_prompt_to_400() -> None:
    app.dependency_overrides[get_description_service] = (
        lambda: _FakeDescriptionService(None, exc=InvalidPrompt("Title is required."))
    )
    _override_auth()
    resp = TestClient(app).post(
        "/api/v1/ai/tasks/generate-description", json={"title": " "}
    )
    assert resp.status_code == 400
    assert resp.json()["detail"]["code"] == "invalid_prompt"
    app.dependency_overrides.clear()


def test_summarize_maps_invalid_prompt_to_400() -> None:
    app.dependency_overrides[get_summary_service] = lambda: _FakeSummaryService(
        None, exc=InvalidPrompt("Description must not be empty.")
    )
    _override_auth()
    resp = TestClient(app).post(
        "/api/v1/ai/tasks/summarize", json={"description": " "}
    )
    assert resp.status_code == 400
    assert resp.json()["detail"]["code"] == "invalid_prompt"
    app.dependency_overrides.clear()


def test_generate_description_requires_auth() -> None:
    resp = TestClient(app).post(
        "/api/v1/ai/tasks/generate-description", json={"title": "x"}
    )
    assert resp.status_code == 401


def test_summarize_requires_auth() -> None:
    resp = TestClient(app).post(
        "/api/v1/ai/tasks/summarize", json={"description": "x"}
    )
    assert resp.status_code == 401
