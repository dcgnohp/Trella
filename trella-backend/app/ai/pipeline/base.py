"""Pipeline core types.

The vocabulary shared by every middleware and the runner. ``AICallContext``
carries the request; ``AIResult`` carries the response; ``TraceContext`` carries
lifecycle metadata that NEVER holds prompt/completion content
(``.ai/AI_ARCHITECTURE.md`` §12-13). An ``AIMiddleware`` owns one cross-cutting
responsibility and wraps the next handler (onion model).
"""

from __future__ import annotations

from collections.abc import AsyncIterator, Awaitable, Callable
from dataclasses import dataclass, field
from typing import Any, Literal

CallKind = Literal["generate", "structured", "stream"]


@dataclass
class TraceContext:
    """Per-request lifecycle metadata. NEVER holds prompt/completion content."""

    feature: str = ""
    provider: str = ""
    model: str = ""
    prompt_version: str = ""
    retry_count: int = 0
    fallback_used: bool = False
    cache_decision: Literal["hit", "miss", "skip", "none"] = "none"
    circuit_state: str | None = None


@dataclass
class AICallContext:
    """The inbound AI call as it flows through the middleware onion."""

    kind: CallKind
    feature: str
    model: str | None
    params: dict[str, Any]
    payload: dict[str, Any]
    trace: TraceContext = field(default_factory=TraceContext)


@dataclass
class AIResult:
    """The outbound result of a unary (non-stream) AI call."""

    value: Any = None
    usage: dict[str, int | None] = field(default_factory=dict)
    provider: str = ""
    model: str = ""
    latency_ms: int = 0
    cost: float | None = None


Handler = Callable[[AICallContext], Awaitable[AIResult]]
StreamHandler = Callable[[AICallContext], AsyncIterator[str]]


class AIMiddleware:
    """One cross-cutting responsibility. Wraps the next handler (onion)."""

    supports_streaming: bool = True

    async def handle(self, ctx: AICallContext, nxt: Handler) -> AIResult:
        return await nxt(ctx)

    def handle_stream(
        self, ctx: AICallContext, nxt: StreamHandler
    ) -> AsyncIterator[str]:
        return nxt(ctx)
