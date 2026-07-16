"""AI Sprint Analysis service.

Composes ``ContextBuilder`` + registry + ``AIBaseService`` for the
``SPRINT_ANALYSIS`` feature. Mirrors ``AIDocumentSummaryService``: it depends
only on a ``ContextBuilder`` for input, never calls business services, imports
no provider SDK, and hardcodes no model or prompt. Validation is the sole
responsibility of ``SprintContext.build()`` (the trust boundary), so this
service does not re-validate; truncation lives in ``AIBaseService``.
"""

from __future__ import annotations

from app.ai.context.base import ContextBuilder
from app.ai.registry import AIFeature, get_structured_config, resolve_model
from app.ai.schemas.sprint_ai_schema import SprintAnalysisResponse
from app.ai.services.ai_base_service import AIBaseService
from app.core.config import Settings


class AISprintService:
    def __init__(self, base: AIBaseService, settings: Settings) -> None:
        self._base = base
        self._settings = settings

    async def analyze(self, context: ContextBuilder) -> SprintAnalysisResponse:
        """Analyze a sprint from built context (structured output)."""
        variables = context.build()  # raises InvalidPrompt for empty/inconsistent input
        config = get_structured_config(AIFeature.SPRINT_ANALYSIS)
        model = resolve_model(config.model_tier, self._settings)

        return await self._base.run_structured(
            prompt_name=config.prompt_name,
            variables=variables,
            response_model=SprintAnalysisResponse,
            model=model,
            feature=AIFeature.SPRINT_ANALYSIS.value,
            temperature=config.temperature,
            max_tokens=config.max_tokens,
            timeout=config.timeout,
            prompt_version=config.prompt_version,
            response_schema_version=config.response_schema_version,
        )
