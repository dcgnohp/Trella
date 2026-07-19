"""Phase 9: document source citations flow from tool result -> event -> SSE."""

from __future__ import annotations

import json
import uuid

from app.ai.reasoning.engine import ToolResultEvent, _extract_citations
from app.ai.routers.ai_router import _reasoning_frame


def _doc_source(title: str) -> dict[str, object]:
    return {
        "type": "document",
        "id": str(uuid.uuid4()),
        "title": title,
        "workspace_id": str(uuid.uuid4()),
    }


def test_extract_citations_collects_document_sources() -> None:
    content = [
        {"doc_id": "1", "title": "A", "source": _doc_source("A")},
        {"doc_id": "2", "title": "B", "source": _doc_source("B")},
    ]
    cites = _extract_citations(content)
    assert cites is not None
    assert [c["title"] for c in cites] == ["A", "B"]
    assert all(c["type"] == "document" for c in cites)


def test_extract_citations_none_for_non_list_or_no_sources() -> None:
    assert _extract_citations({"id": "x"}) is None  # not a list
    assert _extract_citations([{"id": "x"}]) is None  # list without sources
    assert _extract_citations([]) is None


def test_sse_tool_result_includes_citations_when_present() -> None:
    cites = [_doc_source("Auth guide")]
    frame = _reasoning_frame(ToolResultEvent("semantic_search_documents", True, "knowledge", cites))
    # frame is "event: tool_result\ndata: {...}\n\n"
    payload = json.loads(frame.split("data: ", 1)[1].strip())
    assert payload["citations"] == cites
    assert payload["name"] == "semantic_search_documents"


def test_sse_tool_result_omits_citations_when_absent() -> None:
    frame = _reasoning_frame(ToolResultEvent("search_documents", True, "knowledge", None))
    payload = json.loads(frame.split("data: ", 1)[1].strip())
    assert "citations" not in payload
