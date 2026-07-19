"""P3-B6 check: docs AI endpoint via TestClient with overridden deps.

Mirrors ``tests/ai/test_task_ai_router.py``: no network, no DB. The document
summary service and the auth dependency are overridden with fakes so the tests
exercise only routing, camelCase (de)serialization, and the AIError -> HTTP
mapping.
"""

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from app.ai.context.base import ContextBuilder
from app.ai.routers.ai_router import get_document_summary_service
from app.ai.schemas.docs_ai_schema import DocSummaryResponse
from app.ai.utils.errors import AIError, InvalidPrompt
from app.core.deps import get_current_user
from app.main import app
from app.models.users_model import User


class _FakeDocumentSummaryService:
    def __init__(
        self, result: DocSummaryResponse | None, exc: AIError | None = None
    ) -> None:
        self._result = result
        self._exc = exc

    async def summarize(self, context: ContextBuilder) -> DocSummaryResponse:
        if self._exc is not None:
            raise self._exc
        assert self._result is not None
        return self._result


def _override_auth() -> None:
    app.dependency_overrides[get_current_user] = lambda: User(
        email="t@example.com", full_name="Tester"
    )


@pytest.fixture
def docs_client() -> Iterator[TestClient]:
    result = DocSummaryResponse(
        summary="Short document summary.",
        key_points=["KP1", "KP2"],
        key_decisions=["KD1"],
        action_items=["Do this", "Do that"],
    )
    app.dependency_overrides[get_document_summary_service] = lambda: (
        _FakeDocumentSummaryService(result)
    )
    _override_auth()
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_summarize_document_ok(docs_client: TestClient) -> None:
    resp = docs_client.post(
        "/api/v1/ai/docs/summarize", json={"content": "A long document..."}
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["summary"] == "Short document summary."
    # camelCase keys on the wire.
    assert body["keyPoints"] == ["KP1", "KP2"]
    assert body["keyDecisions"] == ["KD1"]
    assert body["actionItems"] == ["Do this", "Do that"]


def test_summarize_document_maps_invalid_prompt_to_400() -> None:
    app.dependency_overrides[get_document_summary_service] = lambda: (
        _FakeDocumentSummaryService(
            None, exc=InvalidPrompt("Document content must not be empty.")
        )
    )
    _override_auth()
    resp = TestClient(app).post("/api/v1/ai/docs/summarize", json={"content": " "})
    assert resp.status_code == 400
    assert resp.json()["detail"]["code"] == "invalid_prompt"
    app.dependency_overrides.clear()


def test_summarize_document_requires_auth() -> None:
    resp = TestClient(app).post("/api/v1/ai/docs/summarize", json={"content": "x"})
    assert resp.status_code == 401
