"""P3-B4 check: KnowledgeContext payload builder (no truncation, no limits)."""

from app.ai.context.knowledge_context import KnowledgeContext
from app.ai.schemas.docs_ai_schema import DocSummaryRequest

_EXPECTED_KEYS = {"title", "content"}


def test_build_has_exact_keys_as_strings() -> None:
    result = KnowledgeContext(content="hello world", title="Doc").build()
    assert set(result) == _EXPECTED_KEYS
    assert all(isinstance(v, str) for v in result.values())
    assert result == {"title": "Doc", "content": "hello world"}


def test_build_title_defaults_to_empty_string() -> None:
    result = KnowledgeContext(content="body").build()
    assert result == {"title": "", "content": "body"}


def test_content_not_truncated_even_when_very_long() -> None:
    long_content = "x" * 500_000
    result = KnowledgeContext(content=long_content).build()
    assert result["content"] == long_content
    assert len(result["content"]) == 500_000


def test_metadata_reports_content_length_and_has_title() -> None:
    with_title = KnowledgeContext(content="abcde", title="T")
    assert with_title.metadata() == {"content_length": 5, "has_title": True}

    without = KnowledgeContext(content="abc")
    assert without.metadata() == {"content_length": 3, "has_title": False}


def test_estimated_tokens_is_roughly_length_over_four() -> None:
    assert KnowledgeContext(content="a" * 400).estimated_tokens() == 100
    assert KnowledgeContext(content="").estimated_tokens() == 0


def test_from_payload_maps_request() -> None:
    req = DocSummaryRequest(content="some doc content", title="Design")
    ctx = KnowledgeContext.from_payload(req)
    assert ctx.content == "some doc content"
    assert ctx.title == "Design"
    assert ctx.build() == {"title": "Design", "content": "some doc content"}


def test_from_payload_maps_request_without_title() -> None:
    req = DocSummaryRequest(content="just content")
    ctx = KnowledgeContext.from_payload(req)
    assert ctx.title is None
    assert ctx.build() == {"title": "", "content": "just content"}
