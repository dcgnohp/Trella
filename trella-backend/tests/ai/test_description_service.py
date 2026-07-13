"""P1-B6 checks: description service composes context + registry + base.

No network: a fake ``AIProvider`` returns a scripted ``StructuredResult`` and is
wrapped in a real ``AIBaseService`` whose ``PromptManager`` points at the real
prompts dir so ``description_generator.md`` actually renders. Sync tests use
``asyncio.run`` (mirrors ``test_ai_base_service.py`` / ``test_structured_generation.py``).
"""

import asyncio
from typing import Any

import pytest

from app.ai.providers.base import AIProvider, StructuredResult
from app.ai.schemas.task_ai_schema import (
    DescriptionResponse,
    GenerateDescriptionRequest,
)
from app.ai.services.ai_base_service import AIBaseService
from app.ai.services.ai_description_service import AIDescriptionService
from app.ai.utils.errors import InvalidPrompt


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
            description="Build the login page.",
            acceptance_criteria=["User can log in"],
            technical_notes=["Use existing auth service"],
            definition_of_done=["Merged and deployed"],
        )
        return StructuredResult(
            parsed=parsed,
            model=model or "gpt-4.1-mini",
            provider=self.name,
            prompt_tokens=1,
            completion_tokens=2,
            total_tokens=3,
        )

    async def health_check(self) -> bool:  # pragma: no cover - unused
        return True


def _service(provider: _FakeProvider) -> AIDescriptionService:
    # Real PromptManager (default dir) so description_generator.md renders.
    return AIDescriptionService(AIBaseService(provider))


def test_generate_happy_path_returns_populated_response() -> None:
    provider = _FakeProvider()
    req = GenerateDescriptionRequest(
        title="Login page",
        labels=["frontend"],
        priority="high",
    )
    result = asyncio.run(_service(provider).generate(req))

    assert isinstance(result, DescriptionResponse)
    assert result.description == "Build the login page."
    assert result.acceptance_criteria == ["User can log in"]
    # The fake provider saw a fully rendered prompt containing the title.
    assert provider.seen_prompt is not None
    assert "Login page" in provider.seen_prompt
    assert "{{" not in provider.seen_prompt


def test_empty_title_raises_invalid_prompt_without_calling_provider() -> None:
    provider = _FakeProvider()
    req = GenerateDescriptionRequest(title="   ")
    with pytest.raises(InvalidPrompt):
        asyncio.run(_service(provider).generate(req))
    assert provider.calls == 0
