"""P6-B8 checks: offline prompt evaluation harness.

Network-free: a fake provider replays a preset structured model, so the harness
runs without any real LLM. Uses ``asyncio.run`` to match the rest of the AI
suite (no pytest-asyncio dependency).
"""

import asyncio
from typing import Any

from app.ai.eval import compare_versions, evaluate_prompt
from app.ai.providers.base import AIProvider, StructuredResult
from app.ai.registry import AIFeature
from app.ai.schemas.task_ai_schema import SummaryResponse

# Two representative cases for the SUMMARIZE feature (description_summary prompt
# takes {{title}} and {{description}}).
CASES = [
    {"title": "Login page", "description": "Add OAuth login for Google."},
    {"title": "Search bug", "description": "Results miss recent items."},
]


class _FakeProvider(AIProvider):
    """Replays a preset model instance for every structured call. No network."""

    name = "fake"

    def __init__(self, instance: SummaryResponse) -> None:
        self._instance = instance

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
        return StructuredResult(
            parsed=self._instance,
            model="fake-model",
            provider=self.name,
            prompt_tokens=1,
            completion_tokens=2,
            total_tokens=3,
        )

    async def health_check(self) -> bool:  # pragma: no cover - unused
        return True


def _valid() -> SummaryResponse:
    return SummaryResponse(
        summary="Adds Google OAuth login.",
        risks=["Token storage"],
        action_items=["Register OAuth client"],
    )


def test_evaluate_prompt_valid_model_passes() -> None:
    provider = _FakeProvider(_valid())
    report = asyncio.run(
        evaluate_prompt(AIFeature.SUMMARIZE, SummaryResponse, provider, CASES)
    )
    assert report.ok
    assert report.passed == len(CASES)
    assert report.failed == 0
    # Defaults to the feature's registered prompt version.
    assert report.version == "v1"


def test_evaluate_prompt_empty_required_field_fails() -> None:
    # A missing required field is impossible (pydantic rejects it), so instead
    # verify the harness flags an EMPTY required string field as failed.
    empty_summary = SummaryResponse(
        summary="   ",  # blank after strip → empty required field
        risks=["something"],
        action_items=["do it"],
    )
    provider = _FakeProvider(empty_summary)
    report = asyncio.run(
        evaluate_prompt(AIFeature.SUMMARIZE, SummaryResponse, provider, CASES)
    )
    assert not report.ok
    assert report.failed == len(CASES)
    assert all("summary" in (c.reason or "") for c in report.cases)


def test_compare_versions_returns_two_reports() -> None:
    provider = _FakeProvider(_valid())
    report_a, report_b = asyncio.run(
        compare_versions(AIFeature.SUMMARIZE, "v1", "v9", provider, CASES)
    )
    assert report_a.version == "v1"
    # v9 has no versioned file → falls back to the plain prompt, still renders.
    assert report_b.version == "v9"
    assert report_a.ok and report_b.ok
    assert report_a.passed == len(CASES)
