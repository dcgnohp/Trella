"""AI Document Summary service.

Composes ``ContextBuilder`` + registry + ``AIBaseService`` for the
``SUMMARIZE_DOCUMENT`` feature. Mirrors ``AIStoryPointService``: it depends
only on a ``ContextBuilder`` for input, never calls business services, imports
no provider SDK, and hardcodes no model or prompt. Truncation lives in
``AIBaseService``, not here.
"""

from __future__ import annotations

from app.ai.context.base import ContextBuilder
from app.ai.registry import AIFeature, get_feature_config, resolve_model
from app.ai.schemas.docs_ai_schema import DocSummaryResponse
from app.ai.services.ai_base_service import AIBaseService
from app.ai.utils.errors import InvalidPrompt
from app.core.config import Settings


class AIDocumentSummaryService:
    def __init__(self, base: AIBaseService, settings: Settings) -> None:
        self._base = base
        self._settings = settings

    async def summarize(self, context: ContextBuilder) -> DocSummaryResponse:
        """Summarize a document from built context."""
        variables = context.build()
        if not variables.get("content", "").strip():
            raise InvalidPrompt("Document content must not be empty.")

        config = get_feature_config(AIFeature.SUMMARIZE_DOCUMENT)
        model = resolve_model(config.model_tier, self._settings)

        return await self._base.run_structured(
            prompt_name=config.prompt_name,
            variables=variables,
            response_model=DocSummaryResponse,
            model=model,
            feature=AIFeature.SUMMARIZE_DOCUMENT.value,
            temperature=config.temperature,
            max_tokens=config.max_tokens,
            timeout=config.timeout,
            prompt_version=config.prompt_version,
            response_schema_version=config.response_schema_version,
        )
