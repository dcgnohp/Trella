"""P5 check: analytics schemas round-trip camelCase and validate bounds."""

import pytest
from pydantic import ValidationError

from app.ai.schemas.sprint_ai_schema import (
    RecommendationItem,
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


def test_sprint_request_rejects_negative_planned_points() -> None:
    with pytest.raises(ValidationError):
        SprintAnalysisRequest(planned_points=-1)
