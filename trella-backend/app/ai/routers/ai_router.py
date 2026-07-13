"""AI platform router.

Exposes the reusable AI endpoints under ``/api/v1/ai``:

* ``GET  /ai/health``   — provider reachability/config status.
* ``POST /ai/generate`` — render a server-side prompt template and generate a
  completion. Generic endpoint reused by future AI features.

Both require an authenticated user. Unified AI errors are mapped to HTTP here
(``.ai/AI_ARCHITECTURE.md`` §10).
"""

from __future__ import annotations

from functools import lru_cache
from typing import Annotated

from fastapi import APIRouter, Depends

from app.ai.providers import get_provider
from app.ai.providers.base import AIProvider
from app.ai.schemas.ai_schema import AIRequest, AIResponse, ProviderHealthResponse
from app.ai.schemas.task_ai_schema import (
    DescriptionResponse,
    GenerateDescriptionRequest,
    SummarizeRequest,
    SummaryResponse,
)
from app.ai.services.ai_base_service import AIBaseService
from app.ai.services.ai_description_service import AIDescriptionService
from app.ai.services.ai_summary_service import AISummaryService
from app.ai.utils.errors import AIError, to_http_exception
from app.core.config import settings
from app.core.deps import CurrentUser

router = APIRouter(prefix="/ai", tags=["ai"])


@lru_cache
def _provider_singleton() -> AIProvider:
    # Single provider instance reuses the underlying HTTP connection pool.
    return get_provider(settings)


def get_ai_service() -> AIBaseService:
    return AIBaseService(_provider_singleton())


AIServiceDep = Annotated[AIBaseService, Depends(get_ai_service)]


def get_description_service(service: AIServiceDep) -> AIDescriptionService:
    return AIDescriptionService(service)


def get_summary_service(service: AIServiceDep) -> AISummaryService:
    return AISummaryService(service)


DescriptionServiceDep = Annotated[AIDescriptionService, Depends(get_description_service)]
SummaryServiceDep = Annotated[AISummaryService, Depends(get_summary_service)]


async def require_ai_access(_current_user: CurrentUser) -> None:
    """Rate-limit seam for AI endpoints (``.ai/PHASE_1_PLAN.md`` §5).

    Phase 1 no-op: authenticates only. This is the single dependency where a
    per-user/per-org limiter will plug in later without touching handlers.
    ponytail: intentional no-op placeholder; upgrade path is a real limiter
    check here (raises ``RateLimited``) in a later phase.
    """
    return None


@router.get("/health", response_model=ProviderHealthResponse)
async def ai_health(
    _current_user: CurrentUser,
    service: AIServiceDep,
) -> ProviderHealthResponse:
    return ProviderHealthResponse(
        provider=service.provider_name,
        model=settings.AI_DEFAULT_MODEL,
        healthy=await service.health_check(),
    )


@router.post("/generate", response_model=AIResponse)
async def ai_generate(
    body: AIRequest,
    _current_user: CurrentUser,
    service: AIServiceDep,
) -> AIResponse:
    try:
        return await service.run(
            prompt_name=body.prompt,
            variables=body.variables,
            model=body.model,
            feature="generate",
        )
    except AIError as err:
        raise to_http_exception(err)


@router.post(
    "/tasks/generate-description",
    response_model=DescriptionResponse,
    dependencies=[Depends(require_ai_access)],
)
async def ai_generate_description(
    body: GenerateDescriptionRequest,
    service: DescriptionServiceDep,
) -> DescriptionResponse:
    try:
        return await service.generate(body)
    except AIError as err:
        raise to_http_exception(err)


@router.post(
    "/tasks/summarize",
    response_model=SummaryResponse,
    dependencies=[Depends(require_ai_access)],
)
async def ai_summarize_task(
    body: SummarizeRequest,
    service: SummaryServiceDep,
) -> SummaryResponse:
    try:
        return await service.summarize(body)
    except AIError as err:
        raise to_http_exception(err)
