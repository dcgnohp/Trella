"""Story Point Service."""

from __future__ import annotations

from app.ai.context.base import ContextBuilder
from app.ai.registry import AIFeature, get_feature_config, resolve_model
from app.ai.schemas.task_ai_schema import StoryPointResponse
from app.ai.services.ai_base_service import AIBaseService
from app.ai.utils.errors import InvalidPrompt, InvalidResponse
from app.core.config import Settings


class AIStoryPointService:
    def __init__(self, base_service: AIBaseService, settings: Settings) -> None:
        self._base = base_service
        self._settings = settings

    async def estimate(self, context: ContextBuilder) -> StoryPointResponse:
        """Estimate story points for a task."""
        variables = context.build()
        title = variables.get("title", "").strip()

        if not title:
            raise InvalidPrompt("Task title cannot be empty.")
        if len(title) > 200:
            raise InvalidPrompt("Task title is too long.")

        config = get_feature_config(AIFeature.ESTIMATE_STORY_POINT)
        model = resolve_model(config.model_tier, self._settings)

        result = await self._base.run_structured(
            prompt_name=config.prompt_name,
            variables=variables,
            response_model=StoryPointResponse,
            model=model,
            feature=AIFeature.ESTIMATE_STORY_POINT.value,
            temperature=config.temperature,
            max_tokens=config.max_tokens,
            timeout=config.timeout,
            prompt_version=config.prompt_version,
            response_schema_version=config.response_schema_version,
        )

        # Validate business logic expectations (model output validation)
        if result.story_point < 0 or result.story_point > 100:
            raise InvalidResponse("Story point must be between 0 and 100.")

        # Clamp confidence
        if result.confidence < 0:
            result.confidence = 0
        elif result.confidence > 100:
            result.confidence = 100

        return result
