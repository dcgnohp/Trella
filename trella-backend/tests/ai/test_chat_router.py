"""P4-B8 check: streaming chat endpoint via TestClient with overridden deps.

Mirrors ``tests/ai/test_docs_ai_router.py``: no network, no DB. The chat
service and the auth dependency are overridden with fakes so the tests
exercise only routing, the SSE frame protocol, and the eager ``InvalidPrompt``
-> ``error`` event mapping. ``TestClient`` buffers the streamed response into
``resp.text``, which is sufficient for these frame assertions.
"""

from __future__ import annotations

from collections.abc import AsyncIterator, Iterator

import pytest
from fastapi.testclient import TestClient

from app.ai.context.chat_context import ChatContext
from app.ai.routers.ai_router import get_chat_service
from app.ai.utils.errors import AIError, InvalidPrompt
from app.core.deps import get_current_user
from app.main import app
from app.models.users_model import User

_VALID_BODY = {
    "messages": [
        {
            "id": "1",
            "timestamp": "2024-01-01T00:00:00Z",
            "role": "user",
            "content": "hi",
        }
    ]
}


class _FakeChatService:
    def __init__(
        self, deltas: list[str] | None = None, exc: AIError | None = None
    ) -> None:
        self._deltas = deltas or []
        self._exc = exc

    def chat(self, context: ChatContext) -> AsyncIterator[str]:
        if self._exc is not None:
            raise self._exc  # eager raise, like the real service

        async def _gen() -> AsyncIterator[str]:
            for d in self._deltas:
                yield d

        return _gen()


def _override_auth() -> None:
    app.dependency_overrides[get_current_user] = lambda: User(
        email="t@example.com", full_name="Tester"
    )


@pytest.fixture
def chat_client() -> Iterator[TestClient]:
    app.dependency_overrides[get_chat_service] = lambda: _FakeChatService(
        deltas=["Hello", " world"]
    )
    _override_auth()
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_chat_streams_deltas_ok(chat_client: TestClient) -> None:
    resp = chat_client.post("/api/v1/ai/chat", json=_VALID_BODY)
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/event-stream")
    assert "event: start" in resp.text
    assert 'event: delta\ndata: {"text": "Hello"}' in resp.text
    assert 'event: delta\ndata: {"text": " world"}' in resp.text
    assert "event: done" in resp.text


def test_chat_emits_error_event_on_invalid_prompt() -> None:
    app.dependency_overrides[get_chat_service] = lambda: _FakeChatService(
        exc=InvalidPrompt("Conversation has no messages.")
    )
    _override_auth()
    resp = TestClient(app).post("/api/v1/ai/chat", json=_VALID_BODY)
    assert resp.status_code == 200
    assert 'event: error\ndata: {"message": "Conversation has no messages."}' in (
        resp.text
    )
    assert "event: done" not in resp.text
    app.dependency_overrides.clear()


def test_chat_requires_auth() -> None:
    resp = TestClient(app).post("/api/v1/ai/chat", json=_VALID_BODY)
    assert resp.status_code == 401
