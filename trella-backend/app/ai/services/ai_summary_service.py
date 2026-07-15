"""AI summary service (Phase 1, Feature 2).

Composes existing platform pieces — ``TaskContext`` for prompt variables, the
feature registry for prompt/model/sampling config, and
``AIBaseService.run_structured`` for the parsed call. Business validation lives
here (not in ``PromptManager``, which stays generic — ``.ai/PHASE_1_PLAN.md``
§3). No business-module coupling, no vendor SDK, no hardcoded model/prompt.
"""

from __future__ import annotations

from app.ai.context.task_context import TaskContext
from app.ai.registry import AIFeature, get_feature_config, resolve_model
from app.ai.schemas.task_ai_schema import SummarizeRequest, SummaryResponse
from app.ai.services.ai_base_service import AIBaseService
from app.ai.utils.errors import InvalidPrompt
from app.core.config import settings


class AISummaryService:
    def __init__(self, base: AIBaseService) -> None:
        self._base = base

    async def summarize(self, req: SummarizeRequest) -> SummaryResponse:
        """Summarize ``req.description`` into a structured ``SummaryResponse``."""
        if not req.description.strip():
            raise InvalidPrompt("Description must not be empty.")

        context = TaskContext(title=req.title or "", description=req.description)
        cfg = get_feature_config(AIFeature.SUMMARIZE)
        model = resolve_model(cfg.model_tier, settings)
        return await self._base.run_structured(
            prompt_name=cfg.prompt_name,
            variables=context.build(),
            response_model=SummaryResponse,
            model=model,
            feature=AIFeature.SUMMARIZE.value,
            temperature=cfg.temperature,
            max_tokens=cfg.max_tokens,
            timeout=cfg.timeout,
            prompt_version=cfg.prompt_version,
            response_schema_version=cfg.response_schema_version,
        )
