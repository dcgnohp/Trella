"""P2-B0 prompt evaluation.

Runs the new prompts against representative sample tasks and asserts the
*structure/plausibility* of the output (not exact content). Hits a real
provider, so it is skipped unless ``RUN_AI_EVAL=1`` and a key are present.

Uses ``asyncio.run`` (no pytest-asyncio dependency), matching the rest of the
AI test suite.
"""

import asyncio
import os

import pytest

from app.ai.context.knowledge_context import KnowledgeContext
from app.ai.context.story_point_context import StoryPointContext
from app.ai.context.task_context import TaskContext
from app.ai.providers import get_provider
from app.ai.registry import AIFeature, get_feature_config, resolve_model
from app.ai.schemas.docs_ai_schema import DocSummaryResponse
from app.ai.schemas.task_ai_schema import BreakdownResponse, StoryPointResponse
from app.ai.services.ai_base_service import AIBaseService
from app.core.config import settings
from tests.ai.eval.samples import (
    BREAKDOWN_SAMPLES,
    DOC_SUMMARY_SAMPLES,
    STORY_POINT_SAMPLES,
)

pytestmark = pytest.mark.skipif(
    not os.getenv("RUN_AI_EVAL")
    or not (settings.OPENAI_API_KEY or settings.GEMINI_API_KEY),
    reason="RUN_AI_EVAL=1 and a provider key required for eval tests",
)


def _base_service() -> AIBaseService:
    # Uses the configured provider (openai or gemini) — provider-agnostic.
    return AIBaseService(provider=get_provider(settings))


def test_eval_breakdown_prompt() -> None:
    base = _base_service()
    config = get_feature_config(AIFeature.BREAK_DOWN_TASK)
    model = resolve_model(config.model_tier, settings)

    async def run() -> None:
        for sample in BREAKDOWN_SAMPLES:
            ctx = TaskContext(
                title=sample["title"],
                description=sample.get("description"),
                labels=sample.get("labels", []),
                priority=sample.get("priority"),
                sprint=sample.get("sprint"),
            )
            result = await base.run_structured(
                prompt_name=config.prompt_name,
                variables=ctx.build(),
                response_model=BreakdownResponse,
                model=model,
                temperature=config.temperature,
                max_tokens=config.max_tokens,
                timeout=config.timeout,
            )
            assert isinstance(result, BreakdownResponse)
            assert len(result.subtasks) > 0
            for subtask in result.subtasks:
                assert subtask.title
                assert subtask.description

    asyncio.run(run())


def test_eval_story_point_prompt() -> None:
    base = _base_service()
    config = get_feature_config(AIFeature.ESTIMATE_STORY_POINT)
    model = resolve_model(config.model_tier, settings)

    async def run() -> None:
        for sample in STORY_POINT_SAMPLES:
            ctx = StoryPointContext(
                title=sample["title"],
                description=sample.get("description"),
                labels=sample.get("labels", []),
                priority=sample.get("priority"),
                sprint_goal=sample.get("sprint_goal"),
                velocity=sample.get("velocity"),
                history=sample.get("history", []),
            )
            result = await base.run_structured(
                prompt_name=config.prompt_name,
                variables=ctx.build(),
                response_model=StoryPointResponse,
                model=model,
                temperature=config.temperature,
                max_tokens=config.max_tokens,
                timeout=config.timeout,
            )
            assert isinstance(result, StoryPointResponse)
            assert result.story_point > 0
            assert 0 <= result.confidence <= 100
            assert result.reason

    asyncio.run(run())


def test_eval_document_summary_prompt() -> None:
    base = _base_service()
    config = get_feature_config(AIFeature.SUMMARIZE_DOCUMENT)
    model = resolve_model(config.model_tier, settings)

    async def run() -> None:
        for sample in DOC_SUMMARY_SAMPLES:
            ctx = KnowledgeContext(
                content=sample["content"],
                title=sample.get("title"),
            )
            result = await base.run_structured(
                prompt_name=config.prompt_name,
                variables=ctx.build(),
                response_model=DocSummaryResponse,
                model=model,
                temperature=config.temperature,
                max_tokens=config.max_tokens,
                timeout=config.timeout,
            )
            assert isinstance(result, DocSummaryResponse)
            assert result.summary

    asyncio.run(run())
