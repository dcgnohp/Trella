import asyncio

import sentry_sdk
from fastapi import FastAPI
from fastapi.routing import APIRoute
from starlette.middleware.cors import CORSMiddleware

from app.api.main import api_router
from app.core.config import settings
from app.core.realtime import ws_manager
from app.endpoints.realtime_router import router as realtime_router


def custom_generate_unique_id(route: APIRoute) -> str:
    return f"{route.tags[0]}-{route.name}"


if settings.SENTRY_DSN and settings.ENVIRONMENT != "local":
    sentry_sdk.init(dsn=str(settings.SENTRY_DSN), enable_tracing=True)

app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    generate_unique_id_function=custom_generate_unique_id,
)


@app.on_event("startup")
async def _bind_realtime_loop() -> None:
    """Capture the running loop so sync push points can schedule WS sends."""
    ws_manager.bind_loop(asyncio.get_running_loop())


@app.on_event("startup")
async def _bind_event_dispatcher() -> None:
    """Capture the loop so sync business publishers can schedule bg jobs."""
    from app.core.events import get_event_dispatcher

    get_event_dispatcher().bind_loop(asyncio.get_running_loop())


@app.on_event("startup")
async def _init_semantic_search() -> None:
    """Phase 9: validate embedding dims (fail fast) + subscribe the background
    document-indexing handlers. No-op unless ``AI_SEMANTIC_SEARCH_ENABLED``.
    """
    if not settings.AI_SEMANTIC_SEARCH_ENABLED:
        return
    from sqlmodel import Session

    from app.ai.retrieval.sync import register_document_indexing
    from app.ai.retrieval.validation import validate_embedding_setup
    from app.core.db import engine

    with Session(engine) as session:
        await validate_embedding_setup(session)
    register_document_indexing()


@app.on_event("startup")
async def _init_workflow_automation() -> None:
    """Phase 10.4: subscribe the event-driven AI workflow-automation handlers
    (e.g. Sprint completed → draft a sprint-summary PROPOSAL). No-op unless
    ``AI_WORKFLOW_ENABLED``. Nothing executes automatically — proposals go
    through the Phase 8 approve→execute path."""
    if not settings.AI_WORKFLOW_ENABLED:
        return
    from app.ai.workflow.automation import register_workflow_automation

    register_workflow_automation()


@app.on_event("startup")
async def _init_mcp() -> None:
    """Phase 10.1: connect MCP servers + register read-only tools. No-op unless
    ``AI_MCP_ENABLED``."""
    from app.ai.mcp.bootstrap import start_mcp

    await start_mcp()


@app.on_event("shutdown")
async def _shutdown_mcp() -> None:
    """Close MCP sessions started at boot (best-effort)."""
    from app.ai.mcp.bootstrap import stop_mcp

    await stop_mcp()


# Set all CORS enabled origins
if settings.all_cors_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.all_cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request, exc: RequestValidationError):
    # If path parameter validation fails (e.g. invalid UUID format in board_id URL), return 404
    for err in exc.errors():
        loc = err.get("loc", [])
        msg = str(err.get("msg", "")).lower()
        if "path" in loc and ("uuid" in msg or "value is not a valid uuid" in msg):
            return JSONResponse(
                status_code=404,
                content={"detail": "Resource not found (invalid UUID)"},
            )
    return JSONResponse(
        status_code=422,
        content={"detail": exc.errors()},
    )


app.include_router(api_router, prefix=settings.API_V1_STR)
# WebSocket routes are mounted at the root (no /api/v1 prefix) to match the
# frontend's realtime URL contract (/ws/...).
app.include_router(realtime_router)
