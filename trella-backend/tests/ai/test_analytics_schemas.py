"""P5 check: analytics schemas round-trip camelCase and validate bounds."""

import pytest
from pydantic import ValidationError

from app.ai.schemas.project_ai_schema import ProjectAssistantResponse
from app.ai.schemas.sprint_ai_schema import (
    BottleneckItem,
    ChecklistItem,
    RecommendationItem,
    RiskItem,
    SprintAnalysisRequest,
    SprintAnalysisResponse,
    SprintHealth,
)


def test_sprint_response_serializes_camel_case() -> None:
    resp = SprintAnalysisResponse(
        executive_summary="all good",
        health=SprintHealth(status="on_track", score=90, rationale="steady"),
        recommendations=[
            RecommendationItem(
                title="rebalance",
                priority="high",
                confidence=0.8,
                expected_impact="faster delivery",
                rationale="load is uneven",
            )
        ],
    )
    dumped = resp.model_dump(by_alias=True)
    assert dumped["executiveSummary"] == "all good"
    assert "suggestedActions" in dumped
    assert dumped["recommendations"][0]["expectedImpact"] == "faster delivery"


def test_sprint_response_v2_fields_round_trip_camel_case() -> None:
    resp = SprintAnalysisResponse(
        executive_summary="all good",
        health=SprintHealth(status="on_track", score=90, rationale="steady"),
        wins=["Shipped checkout"],
        bottlenecks=[
            BottleneckItem(title="Slow reviews", impact="delays merges", area="qa")
        ],
        manager_checklist=[ChecklistItem(label="Sync with QA", priority="high")],
        changes_since_last="velocity improved",
    )
    dumped = resp.model_dump(by_alias=True)
    assert dumped["wins"] == ["Shipped checkout"]
    assert dumped["bottlenecks"][0]["title"] == "Slow reviews"
    assert dumped["managerChecklist"][0]["label"] == "Sync with QA"
    assert dumped["changesSinceLast"] == "velocity improved"


def test_project_response_v2_fields_round_trip_camel_case() -> None:
    resp = ProjectAssistantResponse(
        health_summary="steady",
        health_status="healthy",
        executive_summary="on track overall",
        wins=["Two sprints on time"],
        bottlenecks=[BottleneckItem(title="Handoffs", impact="context loss")],
        manager_checklist=[ChecklistItem(label="Review roadmap")],
        changes_since_last="fewer blockers",
    )
    dumped = resp.model_dump(by_alias=True)
    assert dumped["executiveSummary"] == "on track overall"
    assert dumped["wins"] == ["Two sprints on time"]
    assert dumped["bottlenecks"][0]["title"] == "Handoffs"
    assert dumped["managerChecklist"][0]["label"] == "Review roadmap"
    assert dumped["changesSinceLast"] == "fewer blockers"


def test_risk_item_confidence_bounds() -> None:
    assert (
        RiskItem(title="r", severity="high", rationale="x", confidence=0.5).confidence
        == 0.5
    )
    with pytest.raises(ValidationError):
        RiskItem(title="r", severity="high", rationale="x", confidence=2)


def test_sprint_request_rejects_negative_planned_points() -> None:
    with pytest.raises(ValidationError):
        SprintAnalysisRequest(planned_points=-1)
