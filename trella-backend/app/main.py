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


# Set all CORS enabled origins
if settings.all_cors_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.all_cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

app.include_router(api_router, prefix=settings.API_V1_STR)
# WebSocket routes are mounted at the root (no /api/v1 prefix) to match the
# frontend's realtime URL contract (/ws/...).
app.include_router(realtime_router)
