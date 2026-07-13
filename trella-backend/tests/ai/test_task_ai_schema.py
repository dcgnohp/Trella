"""P1-B5 check: task content schemas round-trip camelCase and snake_case."""

from app.ai.schemas.task_ai_schema import (
    DescriptionResponse,
    GenerateDescriptionRequest,
    SummarizeRequest,
    SummaryResponse,
)


def test_generate_request_accepts_snake_case_input() -> None:
    req = GenerateDescriptionRequest.model_validate(
        {
            "title": "Login page",
            "description": "seed",
            "labels": ["auth", "ui"],
            "priority": "high",
            "sprint": "S1",
        }
    )
    assert req.labels == ["auth", "ui"]
    assert req.priority == "high"


def test_generate_request_label_default_is_independent() -> None:
    a = GenerateDescriptionRequest(title="a")
    b = GenerateDescriptionRequest(title="b")
    a.labels.append("x")
    assert a.labels == ["x"]
    assert b.labels == []  # not shared mutable default


def test_description_response_serializes_camel_case() -> None:
    resp = DescriptionResponse(
        description="do the thing",
        acceptance_criteria=["ac1"],
        technical_notes=["tn1"],
        definition_of_done=["dod1"],
    )
    dumped = resp.model_dump(by_alias=True)
    assert dumped["acceptanceCriteria"] == ["ac1"]
    assert dumped["technicalNotes"] == ["tn1"]
    assert dumped["definitionOfDone"] == ["dod1"]
    assert dumped["description"] == "do the thing"


def test_summarize_request_accepts_snake_case_input() -> None:
    req = SummarizeRequest.model_validate({"description": "text", "title": "t"})
    assert req.description == "text"
    assert req.title == "t"


def test_summary_response_serializes_camel_case() -> None:
    resp = SummaryResponse(summary="s", risks=["r1"], action_items=["a1"])
    dumped = resp.model_dump(by_alias=True)
    assert dumped["actionItems"] == ["a1"]
    assert dumped["risks"] == ["r1"]
    assert dumped["summary"] == "s"
