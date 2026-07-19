"""P6-B4 check: the ``require_ai_access`` dependency enforces the limiter.

Mirrors ``tests/ai/test_docs_ai_router.py``: no network, no DB. A feature
service and ``get_current_user`` are overridden with fakes, and the router's
module-level limiter is swapped for a tiny (capacity=1) one so the second
immediate request returns 429 with the unified error shape. A different user
has an independent bucket and is unaffected.
"""

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from app.ai.context.base import ContextBuilder
from app.ai.routers import ai_router
from app.ai.routers.ai_router import get_document_summary_service
from app.ai.schemas.docs_ai_schema import DocSummaryResponse
from app.ai.utils.rate_limit import TokenBucketRateLimiter
from app.core.deps import get_current_user
from app.main import app
from app.models.users_model import User


class _FakeDocumentSummaryService:
    async def summarize(self, context: ContextBuilder) -> DocSummaryResponse:
        return DocSummaryResponse(
            summary="ok", key_points=[], key_decisions=[], action_items=[]
        )


# Two fixed users with stable, distinct ids so limiter keys are deterministic.
_USER_A = User(email="a@example.com", full_name="A")
_USER_B = User(email="b@example.com", full_name="B")


@pytest.fixture
def limited_client(monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    # capacity=1: first call passes, second is blocked until a slow refill.
    monkeypatch.setattr(
        ai_router,
        "_ai_rate_limiter",
        TokenBucketRateLimiter(capacity=1, refill_per_s=0.001, time_fn=lambda: 0.0),
    )
    app.dependency_overrides[get_document_summary_service] = lambda: (
        _FakeDocumentSummaryService()
    )
    yield TestClient(app)
    app.dependency_overrides.clear()


def _set_user(user: User) -> None:
    app.dependency_overrides[get_current_user] = lambda: user


def _post(client: TestClient) -> object:
    return client.post("/api/v1/ai/docs/summarize", json={"content": "doc"})


def test_second_request_is_rate_limited(limited_client: TestClient) -> None:
    _set_user(_USER_A)

    first = _post(limited_client)
    assert first.status_code == 200

    second = _post(limited_client)
    assert second.status_code == 429
    # Unified AI error shape (see errors.to_http_exception).
    detail = second.json()["detail"]
    assert detail["code"] == "rate_limited"
    assert "rate limit" in detail["message"].lower()


def test_different_user_unaffected(limited_client: TestClient) -> None:
    _set_user(_USER_A)
    assert _post(limited_client).status_code == 200
    assert _post(limited_client).status_code == 429  # A exhausted

    # B has an independent bucket.
    _set_user(_USER_B)
    assert _post(limited_client).status_code == 200
