"""P3-B5 checks: document summary service composes context + registry + base.

No network: a fake ``AIProvider`` returns a scripted ``StructuredResult`` and is
wrapped in a real ``AIBaseService`` whose ``PromptManager`` points at the real
prompts dir so ``document_summary.md`` renders. Sync tests use ``asyncio.run``.
"""

import asyncio
from pathlib import Path
from typing import Any

import pytest

from app.ai.context.knowledge_context import KnowledgeContext
from app.ai.prompts.prompt_manager import PromptManager
from app.ai.providers.base import AIProvider, StructuredResult
from app.ai.schemas.docs_ai_schema import DocSummaryResponse
from app.ai.services.ai_base_service import AIBaseService
from app.ai.services.ai_document_summary_service import AIDocumentSummaryService
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
            summary="Team agreed to ship the docs API in Q3.",
            key_points=["Docs API is the priority for next sprint."],
            key_decisions=["Adopt server-side rendering for prompts."],
            action_items=["Draft the OpenAPI schema."],
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


def _service(provider: AIProvider) -> AIDocumentSummaryService:
    base = AIBaseService(provider, PromptManager(prompts_dir=_REAL_PROMPTS_DIR))
    return AIDocumentSummaryService(base, settings)


def test_summarize_happy_path_returns_populated_response() -> None:
    provider = _FakeProvider()
    context = KnowledgeContext(
        content="The team met to plan the docs API and agreed on the scope.",
        title="Planning notes",
    )
    result = asyncio.run(_service(provider).summarize(context))

    assert isinstance(result, DocSummaryResponse)
    assert result.summary == "Team agreed to ship the docs API in Q3."
    assert result.key_points and result.key_decisions and result.action_items
    # The rendered prompt reached the provider and carried the content text.
    assert provider.seen_prompt is not None
    assert "The team met to plan the docs API" in provider.seen_prompt
    assert "{{" not in provider.seen_prompt  # fully rendered


def test_empty_content_raises_without_calling_provider() -> None:
    provider = _FakeProvider()
    context = KnowledgeContext(content="   ", title="Empty doc")
    with pytest.raises(InvalidPrompt):
        asyncio.run(_service(provider).summarize(context))
    assert provider.calls == 0
