"""AI description generation service (Phase 1, Feature 1).

Composes the AI platform pieces for the ``GENERATE_DESCRIPTION`` feature:
builds a payload-mode :class:`TaskContext`, resolves the model from the feature
registry + settings, and delegates the structured call to
:class:`AIBaseService`. Business validation (a non-empty title) lives here, not
in ``PromptManager`` which stays generic (``.ai/PHASE_1_PLAN.md`` §3, P1-B6).
"""

from __future__ import annotations

from app.ai.context.task_context import TaskContext
from app.ai.registry import AIFeature, get_feature_config, resolve_model
from app.ai.schemas.task_ai_schema import (
    DescriptionResponse,
    GenerateDescriptionRequest,
)
from app.ai.services.ai_base_service import AIBaseService
from app.ai.utils.errors import InvalidPrompt
from app.core.config import settings


class AIDescriptionService:
    """Generate a structured task description from a short seed payload."""

    def __init__(self, base: AIBaseService) -> None:
        self._base = base

    async def generate(self, req: GenerateDescriptionRequest) -> DescriptionResponse:
        """Return a structured description for ``req``.

        Raises :class:`InvalidPrompt` when the title is empty or whitespace.
        """
        if not req.title.strip():
            raise InvalidPrompt("Title is required to generate a description.")

        context = TaskContext(
            title=req.title,
            description=req.description,
            labels=req.labels,
            priority=req.priority,
            sprint=req.sprint,
        )
        cfg = get_feature_config(AIFeature.GENERATE_DESCRIPTION)
        model = resolve_model(cfg.model_tier, settings)
        return await self._base.run_structured(
            prompt_name=cfg.prompt_name,
            variables=context.build(),
            response_model=DescriptionResponse,
            model=model,
            feature=AIFeature.GENERATE_DESCRIPTION.value,
            temperature=cfg.temperature,
            max_tokens=cfg.max_tokens,
            prompt_version=cfg.prompt_version,
            response_model_version=cfg.response_model_version,
        )
