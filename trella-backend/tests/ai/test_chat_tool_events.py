"""P7-B8 check: the reasoning path emits normalized SSE progress/tool frames.

No DB, no network. ``AI_TOOLS_ENABLED`` is flipped on the imported settings, the
router's ``Session(engine)`` is replaced with a no-DB fake context manager, and
the chat service is overridden with a fake whose ``chat_with_tools`` yields a
scripted sequence of :data:`ReasoningEvent`s. We assert the router maps each
event to the right SSE frame (``progress``/``tool_call``/``tool_result``/
``delta``) and that a permission-denied tool result never breaks the stream.
"""

from __future__ import annotations

from collections.abc import AsyncIterator, Iterator
from typing import Any
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

import app.ai.routers.ai_router as ai_router_mod
from app.ai.context.chat_context import ChatContext
from app.ai.reasoning.engine import (
    ProgressEvent,
    ReasoningEvent,
    TextEvent,
    ToolCallEvent,
    ToolResultEvent,
)
from app.ai.routers.ai_router import get_chat_service
from app.core.deps import get_current_user
from app.main import app
from app.models.users_model import User

_BODY = {
    "messages": [
        {
            "id": "1",
            "timestamp": "2024-01-01T00:00:00Z",
            "role": "user",
            "content": "What is task WEB-1 about?",
        }
    ],
    "workspaceId": str(uuid4()),
}


class _FakeSession:
    """Stands in for ``Session(engine)`` so no DB connection is opened."""

    def __enter__(self) -> object:
        return object()

    def __exit__(self, *_exc: Any) -> bool:
        return False


class _FakeReasoningChatService:
    tools_enabled = True

    def chat_with_tools(
        self,
        context: ChatContext,
        *,
        tool_ctx: Any,
        conversation_id: str,
        current_view: dict[str, str] | None = None,
    ) -> AsyncIterator[ReasoningEvent]:
        async def _gen() -> AsyncIterator[ReasoningEvent]:
            yield ProgressEvent("planning", "Planning...")
            yield ToolCallEvent("get_task_detail", "task.detail")
            # A denied tool result must still stream fine (no 500).
            yield ToolResultEvent("get_task_detail", False, None)
            yield ProgressEvent("searching_tasks", "Searching tasks...")
            yield ToolCallEvent("search_tasks", "task.search")
            yield ToolResultEvent("search_tasks", True, "task")
            yield TextEvent("Task WEB-1 covers the login fix.")
            yield ProgressEvent("complete", "Complete")

        return _gen()


@pytest.fixture
def tool_client(monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    monkeypatch.setattr(ai_router_mod.settings, "AI_TOOLS_ENABLED", True)
    monkeypatch.setattr(ai_router_mod, "Session", lambda _engine: _FakeSession())
    app.dependency_overrides[get_chat_service] = _FakeReasoningChatService
    app.dependency_overrides[get_current_user] = lambda: User(
        email="t@example.com", full_name="Tester"
    )
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_chat_tools_emits_normalized_events(tool_client: TestClient) -> None:
    resp = tool_client.post("/api/v1/ai/chat", json=_BODY)
    assert resp.status_code == 200
    text = resp.text

    assert "event: start" in text
    # progress frames carry type + label + timestamp (refinement #9).
    assert "event: progress" in text
    assert '"type": "planning"' in text
    assert '"label": "Planning..."' in text
    assert '"timestamp"' in text
    # tool activity frames.
    assert "event: tool_call" in text
    assert '"capability": "task.detail"' in text
    assert "event: tool_result" in text
    assert '"source": "task"' in text
    # the final answer reuses the delta frame the Phase 4 client already renders.
    assert 'event: delta\ndata: {"text": "Task WEB-1 covers the login fix."}' in text
    assert "event: done" in text


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(pytest.main([__file__, "-q"]))
