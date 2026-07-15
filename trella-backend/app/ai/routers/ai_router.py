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

from app.ai.context.knowledge_context import KnowledgeContext
from app.ai.context.story_point_context import StoryPointContext
from app.ai.context.task_context import TaskContext
from app.ai.providers import get_provider
from app.ai.providers.base import AIProvider
from app.ai.schemas.ai_schema import AIRequest, AIResponse, ProviderHealthResponse
from app.ai.schemas.docs_ai_schema import DocSummaryRequest, DocSummaryResponse
from app.ai.schemas.task_ai_schema import (
    BreakdownRequest,
    BreakdownResponse,
    DescriptionResponse,
    GenerateDescriptionRequest,
    StoryPointRequest,
    StoryPointResponse,
    SummarizeRequest,
    SummaryResponse,
)
from app.ai.services.ai_base_service import AIBaseService
from app.ai.services.ai_description_service import AIDescriptionService
from app.ai.services.ai_document_summary_service import AIDocumentSummaryService
from app.ai.services.ai_story_point_service import AIStoryPointService
from app.ai.services.ai_summary_service import AISummaryService
from app.ai.services.ai_task_breakdown_service import AITaskBreakdownService
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


def get_breakdown_service(service: AIServiceDep) -> AITaskBreakdownService:
    return AITaskBreakdownService(service, settings)


def get_story_point_service(service: AIServiceDep) -> AIStoryPointService:
    return AIStoryPointService(service, settings)


def get_document_summary_service(service: AIServiceDep) -> AIDocumentSummaryService:
    return AIDocumentSummaryService(service, settings)


DescriptionServiceDep = Annotated[AIDescriptionService, Depends(get_description_service)]
SummaryServiceDep = Annotated[AISummaryService, Depends(get_summary_service)]
BreakdownServiceDep = Annotated[AITaskBreakdownService, Depends(get_breakdown_service)]
StoryPointServiceDep = Annotated[AIStoryPointService, Depends(get_story_point_service)]
DocumentSummaryServiceDep = Annotated[
    AIDocumentSummaryService, Depends(get_document_summary_service)
]


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


@router.post(
    "/tasks/breakdown",
    response_model=BreakdownResponse,
    dependencies=[Depends(require_ai_access)],
)
async def ai_breakdown_task(
    body: BreakdownRequest,
    service: BreakdownServiceDep,
) -> BreakdownResponse:
    ctx = TaskContext(
        title=body.title,
        description=body.description,
        labels=body.labels,
        priority=body.priority,
        sprint=body.sprint,
    )
    try:
        return await service.break_down(ctx)
    except AIError as err:
        raise to_http_exception(err)


@router.post(
    "/tasks/story-points",
    response_model=StoryPointResponse,
    dependencies=[Depends(require_ai_access)],
)
async def ai_estimate_story_points(
    body: StoryPointRequest,
    service: StoryPointServiceDep,
) -> StoryPointResponse:
    ctx = StoryPointContext.from_payload(body)
    try:
        return await service.estimate(ctx)
    except AIError as err:
        raise to_http_exception(err)


@router.post(
    "/docs/summarize",
    response_model=DocSummaryResponse,
    dependencies=[Depends(require_ai_access)],
)
async def ai_summarize_document(
    body: DocSummaryRequest,
    service: DocumentSummaryServiceDep,
) -> DocSummaryResponse:
    ctx = KnowledgeContext.from_payload(body)
    try:
        return await service.summarize(ctx)
    except AIError as err:
        raise to_http_exception(err)
