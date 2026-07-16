"""P5 checks: sprint analysis service composes context + registry + base.

No network: a fake ``AIProvider`` returns a scripted ``StructuredResult`` and is
wrapped in a real ``AIBaseService`` whose ``PromptManager`` points at the real
prompts dir so ``sprint_analysis.md`` renders. Sync tests use ``asyncio.run``.
"""

import asyncio
from pathlib import Path
from typing import Any

import pytest

from app.ai.context.sprint_context import SprintContext
from app.ai.prompts.prompt_manager import PromptManager
from app.ai.providers.base import AIProvider, StructuredResult
from app.ai.schemas.sprint_ai_schema import (
    RecommendationItem,
    SprintAnalysisRequest,
    SprintAnalysisResponse,
    SprintHealth,
)
from app.ai.services.ai_base_service import AIBaseService
from app.ai.services.ai_sprint_service import AISprintService
from app.ai.utils.errors import InvalidPrompt
from app.core.config import settings

_REAL_PROMPTS_DIR = Path(__file__).resolve().parents[2] / "app" / "ai" / "prompts"


class _FakeProvider(AIProvider):
    name = "fake"

    def __init__(self) -> None:
        self.seen_prompt: str | None = None
        self.calls = 0

    async def generate(self, **_: Any) -> Any:  # pragma: no cover - unused
        raise NotImplementedError

    async def generate_structured(
        self,
        *,
        prompt: str,
        response_model: type[Any],
        model: str | None = None,
        temperature: float = 0.0,
        max_tokens: int | None = None,
        timeout: float | None = None,
    ) -> StructuredResult[Any]:
        self.calls += 1
        self.seen_prompt = prompt
        parsed = response_model(
            executive_summary="Sprint is slightly behind.",
            health=SprintHealth(
                status="at_risk", score=63, rationale="carry-over rising"
            ),
            recommendations=[
                RecommendationItem(
                    title="Rebalance load",
                    priority="high",
                    confidence=0.8,
                    expected_impact="reduce carry-over",
                    rationale="uneven WIP",
                )
            ],
        )
        return StructuredResult(
            parsed=parsed,
            model=model or "gpt-4.1-mini",
            provider=self.name,
            prompt_tokens=5,
            completion_tokens=7,
            total_tokens=12,
        )

    async def health_check(self) -> bool:
        return True


def _service(provider: AIProvider) -> AISprintService:
    base = AIBaseService(provider, PromptManager(prompts_dir=_REAL_PROMPTS_DIR))
    return AISprintService(base, settings)


def test_analyze_happy_path_returns_populated_response() -> None:
    provider = _FakeProvider()
    context = SprintContext.from_payload(
        SprintAnalysisRequest(
            goal="Ship",
            planned_points=20,
            completed_points=12,
            done_count=6,
            todo_count=2,
        )
    )
    result = asyncio.run(_service(provider).analyze(context))

    assert isinstance(result, SprintAnalysisResponse)
    assert result.executive_summary == "Sprint is slightly behind."
    assert result.health.status == "at_risk"
    assert result.recommendations
    # The rendered prompt reached the provider and carried the sprint data.
    assert provider.seen_prompt is not None
    assert "Ship" in provider.seen_prompt
    assert "{{" not in provider.seen_prompt  # fully rendered


def test_empty_request_raises_without_calling_provider() -> None:
    provider = _FakeProvider()
    context = SprintContext.from_payload(SprintAnalysisRequest())
    with pytest.raises(InvalidPrompt):
        asyncio.run(_service(provider).analyze(context))
    assert provider.calls == 0
