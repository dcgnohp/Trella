"""Phase 5 check: SprintContext / ProjectContext payload builders.

The trust boundary is ``build()``: it must produce the exact frozen variable
contract for valid data and reject empty or self-inconsistent metrics.
"""

import pytest

from app.ai.context.project_context import ProjectContext
from app.ai.context.sprint_context import SprintContext
from app.ai.schemas.project_ai_schema import (
    ProjectAssistantRequest,
    ProjectSprintSummary,
)
from app.ai.schemas.sprint_ai_schema import SprintAnalysisRequest
from app.ai.utils.errors import InvalidPrompt

_SPRINT_KEYS = {
    "sprint",
    "metrics",
    "blocked_tasks",
    "carried_over_tasks",
    "previous_summary",
}
_PROJECT_KEYS = {
    "project",
    "sprints",
    "active_sprint",
    "metrics",
    "risks_hint",
    "previous_summary",
}


def test_sprint_build_returns_contract_and_content() -> None:
    req = SprintAnalysisRequest(
        goal="Ship checkout v2",
        status="active",
        start_date="2024-01-01",
        end_date="2024-01-14",
        planned_points=20,
        completed_points=12,
        todo_count=2,
        in_progress_count=3,
        done_count=6,
        blocked_tasks=["Payments API down"],
    )
    result = SprintContext.from_payload(req).build()

    assert set(result) == _SPRINT_KEYS
    assert all(isinstance(v, str) for v in result.values())
    assert "Ship checkout v2" in result["sprint"]
    # 12 / 20 = 60% completion figure.
    assert "60%" in result["metrics"]
    assert "Payments API down" in result["blocked_tasks"]
    assert result["carried_over_tasks"] == "None"
    # previous_summary defaults to "None" when not provided.
    assert result["previous_summary"] == "None"


def test_sprint_build_includes_previous_summary_when_provided() -> None:
    req = SprintAnalysisRequest(
        previous_summary="Last sprint we slipped by 5 SP", goal="x"
    )
    result = SprintContext.from_payload(req).build()
    assert result["previous_summary"] == "Last sprint we slipped by 5 SP"


def test_sprint_empty_request_raises() -> None:
    with pytest.raises(InvalidPrompt):
        SprintContext.from_payload(SprintAnalysisRequest()).build()


def test_sprint_completed_exceeding_planned_raises() -> None:
    req = SprintAnalysisRequest(completed_points=10, planned_points=5)
    with pytest.raises(InvalidPrompt):
        SprintContext.from_payload(req).build()


def test_sprint_blocked_tasks_overflow_collapses() -> None:
    req = SprintAnalysisRequest(blocked_tasks=[f"t{i}" for i in range(25)])
    result = SprintContext.from_payload(req).build()
    assert "…and 5 more" in result["blocked_tasks"]


def test_project_build_returns_contract_and_content() -> None:
    req = ProjectAssistantRequest(
        name="Trella",
        mode="overview",
        recent_sprints=[
            ProjectSprintSummary(name="S1", status="done", completion_rate=0.9),
        ],
        active_sprint=ProjectSprintSummary(
            name="S2", status="active", completion_rate=0.4
        ),
        total_tasks=50,
        done_tasks=30,
        blocked_tasks=2,
        known_risks=["Scope creep"],
    )
    result = ProjectContext.from_payload(req).build()

    assert set(result) == _PROJECT_KEYS
    assert all(isinstance(v, str) for v in result.values())
    assert "Trella" in result["project"]
    assert "S1" in result["sprints"]
    assert "S2" in result["active_sprint"]
    # 30 / 50 = 60% done figure.
    assert "60%" in result["metrics"]
    assert "Scope creep" in result["risks_hint"]
    assert result["previous_summary"] == "None"


def test_project_build_includes_previous_summary_when_provided() -> None:
    req = ProjectAssistantRequest(
        total_tasks=5, done_tasks=1, previous_summary="prev overview"
    )
    result = ProjectContext.from_payload(req).build()
    assert result["previous_summary"] == "prev overview"


def test_project_empty_request_raises() -> None:
    with pytest.raises(InvalidPrompt):
        ProjectContext.from_payload(ProjectAssistantRequest()).build()


def test_project_done_exceeding_total_raises() -> None:
    req = ProjectAssistantRequest(total_tasks=5, done_tasks=10)
    with pytest.raises(InvalidPrompt):
        ProjectContext.from_payload(req).build()
