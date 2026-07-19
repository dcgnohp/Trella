"""AI middleware pipeline.

An onion of cross-cutting middlewares wrapped around a terminal handler that
does the real provider call. With no middlewares configured the pipeline is a
pass-through, so ``AIBaseService`` behaves exactly as before (see
``.ai/PHASE_6_PLAN.md`` P6-B0).
"""

from __future__ import annotations

from app.ai.pipeline.base import (
    AICallContext,
    AIMiddleware,
    AIResult,
    CallKind,
    Handler,
    StreamHandler,
    TraceContext,
)
from app.ai.pipeline.runner import AIPipeline

__all__ = [
    "AICallContext",
    "AIMiddleware",
    "AIPipeline",
    "AIResult",
    "CallKind",
    "Handler",
    "StreamHandler",
    "TraceContext",
]
