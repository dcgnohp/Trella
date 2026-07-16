"""AI Project service.

Composes ``ContextBuilder`` + registry + ``AIBaseService`` for the
``PROJECT_ASSISTANT`` feature. Mirrors ``AIDocumentSummaryService``: it depends
only on a ``ContextBuilder`` for input, never calls business services, imports
no provider SDK, and hardcodes no model or prompt. Validation is the trust
boundary of ``ProjectContext.build()`` (raises ``InvalidPrompt``); the service
never re-validates. Truncation lives in ``AIBaseService``, not here.
"""

from __future__ import annotations

from app.ai.context.base import ContextBuilder
from app.ai.registry import AIFeature, get_structured_config, resolve_model
from app.ai.schemas.project_ai_schema import ProjectAssistantResponse
from app.ai.services.ai_base_service import AIBaseService
from app.core.config import Settings


class AIProjectService:
    def __init__(self, base: AIBaseService, settings: Settings) -> None:
        self._base = base
        self._settings = settings

    async def assist(self, context: ContextBuilder) -> ProjectAssistantResponse:
        """Produce a project executive overview from built context (structured)."""
        variables = context.build()  # raises InvalidPrompt for empty/inconsistent input
        config = get_structured_config(AIFeature.PROJECT_ASSISTANT)
        model = resolve_model(config.model_tier, self._settings)
        return await self._base.run_structured(
            prompt_name=config.prompt_name,
            variables=variables,
            response_model=ProjectAssistantResponse,
            model=model,
            feature=AIFeature.PROJECT_ASSISTANT.value,
            temperature=config.temperature,
            max_tokens=config.max_tokens,
            timeout=config.timeout,
            prompt_version=config.prompt_version,
            response_schema_version=config.response_schema_version,
        )
