"""B8 check: AI router end-to-end via TestClient with overridden deps.

No network and no DB: the provider/service and the auth dependency are
overridden so the test exercises routing, schema (de)serialization, and the
AIError -> HTTP mapping only.
"""

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from app.ai.providers.base import AIProvider, GenerationResult
from app.ai.routers.ai_router import get_ai_service
from app.ai.services.ai_base_service import AIBaseService
from app.ai.utils.errors import RateLimited
from app.core.deps import get_current_user
from app.main import app
from app.models.users_model import User


class _FakeProvider(AIProvider):
    name = "openai"

    def __init__(self, result: GenerationResult | None, exc: Exception | None) -> None:
        self._result = result
        self._exc = exc

    async def generate(
        self,
        *,
        prompt: str,
        model: str | None = None,
        temperature: float = 0.0,
        max_tokens: int | None = None,
        timeout: float | None = None,
    ) -> GenerationResult:
        if self._exc is not None:
            raise self._exc
        assert self._result is not None
        return self._result

    async def health_check(self) -> bool:
        return True


def _client(
    result: GenerationResult | None = None, exc: Exception | None = None
) -> Iterator[TestClient]:
    service = AIBaseService(_FakeProvider(result, exc))
    app.dependency_overrides[get_ai_service] = lambda: service
    app.dependency_overrides[get_current_user] = lambda: User(
        email="t@example.com", full_name="Tester"
    )
    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture
def ok_client() -> Iterator[TestClient]:
    yield from _client(
        result=GenerationResult(content="pong", model="gpt-4.1", provider="openai")
    )


def test_health_ok(ok_client: TestClient) -> None:
    resp = ok_client.get("/api/v1/ai/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["provider"] == "openai"
    assert body["healthy"] is True


def test_generate_ok(ok_client: TestClient) -> None:
    resp = ok_client.post(
        "/api/v1/ai/generate", json={"prompt": "_ping", "variables": {"message": "hi"}}
    )
    assert resp.status_code == 200
    assert resp.json()["content"] == "pong"


def test_generate_maps_rate_limit_to_429() -> None:
    client = next(_client(exc=RateLimited("slow down")))
    resp = client.post(
        "/api/v1/ai/generate", json={"prompt": "_ping", "variables": {"message": "hi"}}
    )
    assert resp.status_code == 429
    assert resp.json()["detail"]["code"] == "rate_limited"
    app.dependency_overrides.clear()


def test_requires_auth() -> None:
    # No auth override -> the real dependency rejects the request.
    resp = TestClient(app).get("/api/v1/ai/health")
    assert resp.status_code == 401
