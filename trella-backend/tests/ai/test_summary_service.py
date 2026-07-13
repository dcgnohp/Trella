"""P1-B7 checks: summary service composes context + registry + base service.

No network: a fake ``AIProvider`` returns a scripted ``StructuredResult`` and is
wrapped in a real ``AIBaseService`` whose ``PromptManager`` points at the real
prompts dir so ``description_summary.md`` renders. Sync tests use ``asyncio.run``.
"""

import asyncio
from pathlib import Path
from typing import Any

import pytest

from app.ai.prompts.prompt_manager import PromptManager
from app.ai.providers.base import AIProvider, StructuredResult
from app.ai.schemas.task_ai_schema import SummarizeRequest, SummaryResponse
from app.ai.services.ai_base_service import AIBaseService
from app.ai.services.ai_summary_service import AISummaryService
from app.ai.utils.errors import InvalidPrompt

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
    ) -> StructuredResult[Any]:
        self.calls += 1
        self.seen_prompt = prompt
        parsed = response_model(
            summary="Ship the login page.",
            risks=["Auth provider not finalized."],
            action_items=["Wire up OAuth callback."],
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


def _service(provider: AIProvider) -> AISummaryService:
    base = AIBaseService(provider, PromptManager(prompts_dir=_REAL_PROMPTS_DIR))
    return AISummaryService(base)


def test_summarize_happy_path_returns_populated_response() -> None:
    provider = _FakeProvider()
    req = SummarizeRequest(
        title="Login page",
        description="Build the OAuth login flow with a callback handler.",
    )
    result = asyncio.run(_service(provider).summarize(req))

    assert isinstance(result, SummaryResponse)
    assert result.summary == "Ship the login page."
    assert result.risks and result.action_items
    # The rendered prompt reached the provider and carried the description text.
    assert provider.seen_prompt is not None
    assert "Build the OAuth login flow" in provider.seen_prompt
    assert "{{" not in provider.seen_prompt  # fully rendered


def test_empty_description_raises_without_calling_provider() -> None:
    provider = _FakeProvider()
    req = SummarizeRequest(title="X", description="   ")
    with pytest.raises(InvalidPrompt):
        asyncio.run(_service(provider).summarize(req))
    assert provider.calls == 0
