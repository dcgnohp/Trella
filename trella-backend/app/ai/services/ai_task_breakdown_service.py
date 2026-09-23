"""Task Breakdown Service."""

from __future__ import annotations

from app.ai.context.base import ContextBuilder
from app.ai.registry import AIFeature, get_feature_config, resolve_model
from app.ai.schemas.task_ai_schema import BreakdownResponse
from app.ai.services.ai_base_service import AIBaseService
from app.ai.utils.errors import InvalidPrompt
from app.core.config import Settings


class AITaskBreakdownService:
    def __init__(self, base_service: AIBaseService, settings: Settings) -> None:
        self._base = base_service
        self._settings = settings

    async def break_down(self, context: ContextBuilder) -> BreakdownResponse:
        """Break down a task into subtasks."""
        variables = context.build()
        title = variables.get("title", "").strip()

        if not title:
            raise InvalidPrompt("Task title cannot be empty.")
        if len(title) > 200:
            raise InvalidPrompt("Task title is too long.")

        config = get_feature_config(AIFeature.BREAK_DOWN_TASK)
        model = resolve_model(config.model_tier, self._settings)

        return await self._base.run_structured(
            prompt_name=config.prompt_name,
            variables=variables,
            response_model=BreakdownResponse,
            model=model,
            feature=AIFeature.BREAK_DOWN_TASK.value,
            temperature=config.temperature,
            max_tokens=config.max_tokens,
            timeout=config.timeout,
            prompt_version=config.prompt_version,
            response_schema_version=config.response_schema_version,
        )
