"""AI request/response schemas.

Extend the project's :class:`CamelModel` so the API speaks camelCase on the
wire while accepting snake_case internally. The platform never returns raw
dicts (``.ai/PHASE_0_PLAN.md`` B6).
"""

from __future__ import annotations

from app.core.base import CamelModel


class AIRequest(CamelModel):
    """A generic generation request reused by future AI features."""

    prompt: str
    model: str | None = None
    variables: dict[str, str] | None = None


class AIResponse(CamelModel):
    """A generated result plus lightweight, non-sensitive metadata."""

    content: str
    model: str
    provider: str
    latency_ms: int


class ProviderHealthResponse(CamelModel):
    """Reported by ``GET /ai/health``."""

    provider: str
    model: str
    healthy: bool
