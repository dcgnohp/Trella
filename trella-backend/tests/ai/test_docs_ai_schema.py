"""P3-B1 check: doc summary schemas round-trip camelCase and snake_case."""

from app.ai.schemas.docs_ai_schema import DocSummaryRequest, DocSummaryResponse


def test_summary_request_accepts_snake_case_input() -> None:
    req = DocSummaryRequest.model_validate({"content": "text", "title": "t"})
    assert req.content == "text"
    assert req.title == "t"


def test_summary_request_title_defaults_to_none() -> None:
    req = DocSummaryRequest(content="text")
    assert req.title is None


def test_summary_response_serializes_camel_case() -> None:
    resp = DocSummaryResponse(
        summary="s",
        key_points=["kp1"],
        key_decisions=["kd1"],
        action_items=["ai1"],
    )
    dumped = resp.model_dump(by_alias=True)
    assert dumped["summary"] == "s"
    assert dumped["keyPoints"] == ["kp1"]
    assert dumped["keyDecisions"] == ["kd1"]
    assert dumped["actionItems"] == ["ai1"]


def test_summary_response_list_defaults_are_independent() -> None:
    a = DocSummaryResponse(summary="a")
    b = DocSummaryResponse(summary="b")
    a.key_points.append("x")
    a.key_decisions.append("y")
    a.action_items.append("z")
    assert a.key_points == ["x"]
    assert a.key_decisions == ["y"]
    assert a.action_items == ["z"]
    # not shared mutable defaults
    assert b.key_points == []
    assert b.key_decisions == []
    assert b.action_items == []
