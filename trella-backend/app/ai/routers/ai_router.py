"""AI platform router.

Exposes the reusable AI endpoints under ``/api/v1/ai``:

* ``GET  /ai/health``   — provider reachability/config status.
* ``POST /ai/generate`` — render a server-side prompt template and generate a
  completion. Generic endpoint reused by future AI features.

Both require an authenticated user. Unified AI errors are mapped to HTTP here
(``.ai/AI_ARCHITECTURE.md`` §10).
"""

from __future__ import annotations

import json
from collections.abc import AsyncIterator
from datetime import datetime, timezone
from functools import lru_cache
from typing import Annotated
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlmodel import Session

from app.ai.agent.action_plan import get_action_plan_store
from app.ai.agent.execution_engine import ExecutionEngine
from app.ai.config.profiles import build_middlewares
from app.ai.context.chat_context import ChatContext
from app.ai.context.knowledge_context import KnowledgeContext
from app.ai.context.project_context import ProjectContext
from app.ai.context.sprint_context import SprintContext
from app.ai.context.story_point_context import StoryPointContext
from app.ai.context.task_context import TaskContext
from app.ai.providers import get_provider
from app.ai.providers.base import AIProvider
from app.ai.reasoning.engine import (
    ActionProposalEvent,
    PlanReadyEvent,
    ProgressEvent,
    ReasoningEvent,
    TextEvent,
    ToolCallEvent,
    ToolResultEvent,
)
from app.ai.schemas.agent_schema import (
    ActionResultOut,
    ExecuteActionsRequest,
    ExecuteActionsResponse,
)
from app.ai.schemas.ai_schema import AIRequest, AIResponse, ProviderHealthResponse
from app.ai.schemas.chat_schema import ChatRequest
from app.ai.schemas.docs_ai_schema import DocSummaryRequest, DocSummaryResponse
from app.ai.schemas.project_ai_schema import (
    ProjectAssistantRequest,
    ProjectAssistantResponse,
)
from app.ai.schemas.sprint_ai_schema import (
    SprintAnalysisRequest,
    SprintAnalysisResponse,
)
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
from app.ai.services.ai_chat_service import AIChatService
from app.ai.services.ai_description_service import AIDescriptionService
from app.ai.services.ai_document_summary_service import AIDocumentSummaryService
from app.ai.services.ai_project_service import AIProjectService
from app.ai.services.ai_sprint_service import AISprintService
from app.ai.services.ai_story_point_service import AIStoryPointService
from app.ai.services.ai_summary_service import AISummaryService
from app.ai.services.ai_task_breakdown_service import AITaskBreakdownService
from app.ai.telemetry.metrics import get_metrics_collector
from app.ai.telemetry.tracing import get_tracing_collector
from app.ai.tools.base import ToolContext
from app.ai.utils.errors import AIError, RateLimited, to_http_exception
from app.ai.utils.logging import emit_event
from app.ai.utils.rate_limit import TokenBucketRateLimiter
from app.core.config import settings
from app.core.db import engine
from app.core.deps import CurrentUser, SessionDep
from app.models.users_model import User

router = APIRouter(prefix="/ai", tags=["ai"])


@lru_cache
def _provider_singleton() -> AIProvider:
    # Single provider instance reuses the underlying HTTP connection pool.
    return get_provider(settings)


def get_ai_service() -> AIBaseService:
    # Middleware stack is assembled per the resolved profile (P6-B9). Under the
    # test environment (ENVIRONMENT="local") this resolves to TESTING -> an
    # empty stack, so the pipeline stays a deterministic pass-through.
    middlewares = build_middlewares(settings)
    return AIBaseService(_provider_singleton(), middlewares=middlewares)


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


def get_chat_service(service: AIServiceDep) -> AIChatService:
    return AIChatService(service, settings)


def get_sprint_service(service: AIServiceDep) -> AISprintService:
    return AISprintService(service, settings)


def get_project_service(service: AIServiceDep) -> AIProjectService:
    return AIProjectService(service, settings)


DescriptionServiceDep = Annotated[
    AIDescriptionService, Depends(get_description_service)
]
SummaryServiceDep = Annotated[AISummaryService, Depends(get_summary_service)]
BreakdownServiceDep = Annotated[AITaskBreakdownService, Depends(get_breakdown_service)]
StoryPointServiceDep = Annotated[AIStoryPointService, Depends(get_story_point_service)]
DocumentSummaryServiceDep = Annotated[
    AIDocumentSummaryService, Depends(get_document_summary_service)
]
ChatServiceDep = Annotated[AIChatService, Depends(get_chat_service)]
SprintServiceDep = Annotated[AISprintService, Depends(get_sprint_service)]
ProjectServiceDep = Annotated[AIProjectService, Depends(get_project_service)]


# Process-wide limiter shared across requests. This is the pipeline's outermost
# concern, enforced here because the router boundary is the single place where
# CurrentUser identity is available without threading it through the services
# (P6-B4). Tests swap this object for a tiny-capacity one.
_ai_rate_limiter = TokenBucketRateLimiter()


async def require_ai_access(current_user: CurrentUser) -> None:
    """Per-user rate limit for AI endpoints (``.ai/PHASE_6_PLAN.md`` P6-B4).

    Runs as a dependency *before* the handler try/except, so it converts the
    unified ``RateLimited`` error to an ``HTTPException`` (429) here to keep the
    JSON error shape consistent with the handlers.
    """
    if not _ai_rate_limiter.allow(str(current_user.id)):
        raise to_http_exception(
            RateLimited("AI request rate limit exceeded. Please retry shortly.")
        )
    return None


def require_superuser(current_user: CurrentUser) -> User:
    """Gate an endpoint to superusers only.

    No dedicated superuser dependency exists in ``app.core.deps`` yet, so this
    checks the flag on the authenticated user directly: unauthenticated requests
    are already rejected (401) by ``get_current_user``; a non-superuser gets 403.
    """
    if not current_user.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Superuser privileges required",
        )
    return current_user


@router.get("/metrics")
async def ai_metrics(
    _superuser: Annotated[User, Depends(require_superuser)],
) -> dict[str, object]:
    """Aggregate AI metrics for operators (superuser only).

    Returns counter/cost snapshots plus a count of recent trace spans. No
    prompt/response content is ever exposed here -- metrics are aggregates and
    trace spans hold lifecycle metadata only.
    """
    return {
        "metrics": get_metrics_collector().snapshot(),
        "recent_traces": len(get_tracing_collector().recent()),
    }


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


@router.post(
    "/sprint/analysis",
    response_model=SprintAnalysisResponse,
    dependencies=[Depends(require_ai_access)],
)
async def ai_sprint_analysis(
    body: SprintAnalysisRequest,
    service: SprintServiceDep,
) -> SprintAnalysisResponse:
    ctx = SprintContext.from_payload(body)
    try:
        return await service.analyze(ctx)
    except AIError as err:
        raise to_http_exception(err)


@router.post(
    "/project/assistant",
    response_model=ProjectAssistantResponse,
    dependencies=[Depends(require_ai_access)],
)
async def ai_project_assistant(
    body: ProjectAssistantRequest,
    service: ProjectServiceDep,
) -> ProjectAssistantResponse:
    ctx = ProjectContext.from_payload(body)
    try:
        return await service.assist(ctx)
    except AIError as err:
        raise to_http_exception(err)


def _now_iso() -> str:
    """UTC timestamp for normalized SSE progress/tool events."""
    return datetime.now(timezone.utc).isoformat()


def _sse(event: str, data: dict[str, object]) -> str:
    """Format one SSE frame."""
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


def _reasoning_frame(event: ReasoningEvent) -> str:
    """Map a normalized :data:`ReasoningEvent` onto an SSE frame.

    Progress/tool frames carry ``type``/``label``/``timestamp`` (refinement #9);
    text reuses the ``delta`` frame so the existing client renders it unchanged.
    ``tool_result`` reports only the tool name + source + ok flag — never the
    (possibly sensitive) tool content.
    """
    if isinstance(event, TextEvent):
        return _sse("delta", {"text": event.text})
    if isinstance(event, ProgressEvent):
        return _sse(
            "progress",
            {"type": event.kind, "label": event.label, "timestamp": _now_iso()},
        )
    if isinstance(event, ToolCallEvent):
        return _sse(
            "tool_call",
            {
                "name": event.name,
                "capability": event.capability,
                "timestamp": _now_iso(),
            },
        )
    if isinstance(event, ToolResultEvent):
        payload: dict[str, object] = {
            "name": event.name,
            "ok": event.ok,
            "source": event.source,
            "timestamp": _now_iso(),
        }
        # Document source citations (id/title/workspaceId) when a retrieval tool
        # produced them — never chunk ids, scores, or embedding metadata.
        if event.citations:
            payload["citations"] = event.citations
        return _sse("tool_result", payload)
    if isinstance(event, ActionProposalEvent):
        return _sse(
            "action_proposal",
            {
                "actionId": event.action_id,
                "toolName": event.tool_name,
                "preview": event.preview,
                "capability": event.capability,
                "timestamp": _now_iso(),
            },
        )
    if isinstance(event, PlanReadyEvent):
        return _sse(
            "plan_ready",
            {
                "planId": event.plan_id,
                "actionCount": event.action_count,
                "timestamp": _now_iso(),
            },
        )
    # Unreachable given the ReasoningEvent union; kept exhaustive for safety.
    return _sse("delta", {"text": ""})  # pragma: no cover


def _current_view(body: ChatRequest) -> dict[str, str]:
    """Collect the supplied current-view ids (as strings) for prompt seeding."""
    ids = {
        "workspace_id": body.workspace_id,
        "project_id": body.project_id,
        "sprint_id": body.sprint_id,
        "task_id": body.task_id,
    }
    return {key: str(value) for key, value in ids.items() if value is not None}


@router.post("/chat", dependencies=[Depends(require_ai_access)])
async def ai_chat(
    body: ChatRequest,
    service: ChatServiceDep,
    current_user: CurrentUser,
) -> StreamingResponse:
    """Stream a chat completion as Server-Sent Events.

    Payload-only path (Phase 4): ``start`` once, a ``delta`` frame per text
    chunk, an ``error`` frame on :class:`AIError` (then stops), ``done`` on
    success. Reasoning path (Phase 7, when ``AI_TOOLS_ENABLED`` and a
    ``workspaceId`` is supplied): additionally emits normalized ``progress``,
    ``tool_call`` and ``tool_result`` frames around the tool loop. Older clients
    ignore unknown event types (forward-compatible SSE from Phase 4).

    ``AIChatService`` is invoked inside the generator because it can raise
    ``InvalidPrompt`` eagerly, which must surface as an ``error`` event rather
    than an unhandled 500.
    """
    ctx = ChatContext.from_payload(body)
    present = sorted(ctx.conversation_context.model_dump(exclude_none=True).keys())
    # Use tools only when enabled AND the caller told us which workspace to scope
    # to — without a workspace there is nothing safe to look up.
    # Order matters: check the cheap/safe conditions first and use getattr so a
    # test double without ``tools_enabled`` never raises (falls back to plain chat).
    use_tools = (
        body.workspace_id is not None
        and settings.AI_TOOLS_ENABLED
        and getattr(service, "tools_enabled", False)
    )
    emit_event(
        "AI_CHAT_REQUEST",
        has_context=bool(present),
        sections=",".join(present) or "none",
        messages=len(body.messages),
        tools=use_tools,
    )

    async def event_stream() -> AsyncIterator[str]:
        yield "event: start\ndata: {}\n\n"
        try:
            if use_tools:
                conversation_id = body.conversation_id or uuid4().hex
                # A fresh read-only session for the tool loop; kept open for the
                # duration of the stream. ponytail: business services are sync,
                # so each tool call briefly blocks the event loop. Upgrade path =
                # an async session / threadpool offload if tool latency grows.
                with Session(engine) as db:
                    tool_ctx = ToolContext(
                        session=db,
                        user=current_user,
                        workspace_id=body.workspace_id,
                    )
                    async for event in service.chat_with_tools(
                        ctx,
                        tool_ctx=tool_ctx,
                        conversation_id=conversation_id,
                        current_view=_current_view(body),
                    ):
                        yield _reasoning_frame(event)
            else:
                async for delta in service.chat(ctx):
                    yield f"event: delta\ndata: {json.dumps({'text': delta})}\n\n"
        except AIError as err:
            yield f"event: error\ndata: {json.dumps({'message': err.message})}\n\n"
            return
        yield "event: done\ndata: {}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post(
    "/actions/execute",
    response_model=ExecuteActionsResponse,
    dependencies=[Depends(require_ai_access)],
)
async def ai_execute_actions(
    body: ExecuteActionsRequest,
    current_user: CurrentUser,
    session: SessionDep,
) -> ExecuteActionsResponse:
    """Approve + execute the proposed writes of an ActionPlan (Phase 8).

    Propose → Approve → **Execute**: the reasoning loop only proposed the writes
    (parked in an ``ActionPlan`` by ``plan_id``); this normal JSON endpoint runs
    the approved ones via the Execution Engine, which re-checks RBAC at execution
    time. Gated by ``AI_AGENT_WRITE_ENABLED`` (off in local/test).
    """
    if not settings.AI_AGENT_WRITE_ENABLED:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="AI agent write is disabled",
        )
    plan = get_action_plan_store().get(body.plan_id)
    if plan is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Action plan not found or expired",
        )
    ctx = ToolContext(
        session=session, user=current_user, workspace_id=body.workspace_id
    )
    approved = set(body.approved_action_ids) or None
    results = await ExecutionEngine().execute(
        plan, ctx, approved_action_ids=approved, approve_all=body.approve_all
    )
    return ExecuteActionsResponse(
        results=[
            ActionResultOut(
                action_id=r.action_id,
                tool_name=r.tool_name,
                ok=r.ok,
                status=r.status,
                summary=r.summary,
                error=r.error,
            )
            for r in results
        ]
    )
