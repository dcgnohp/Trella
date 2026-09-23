"""Unified AI platform errors.

Business modules never handle provider-specific errors (see
``.ai/AI_ARCHITECTURE.md`` §10). Providers translate their SDK failures into
these types; the router maps them to HTTP responses via ``to_http_exception``.
"""

from __future__ import annotations

from fastapi import HTTPException, status


class AIError(Exception):
    """Base class for all AI platform errors.

    Each subclass declares the HTTP ``status_code`` and stable ``code`` used
    when the error surfaces at the API boundary.
    """

    status_code: int = status.HTTP_500_INTERNAL_SERVER_ERROR
    code: str = "ai_error"

    def __init__(self, message: str | None = None) -> None:
        self.message = message or (self.__doc__ or self.code).strip().splitlines()[0]
        super().__init__(self.message)


class ProviderTimeout(AIError):
    """The AI provider did not respond in time."""

    status_code = status.HTTP_504_GATEWAY_TIMEOUT
    code = "provider_timeout"


class ProviderUnavailable(AIError):
    """The AI provider is unavailable or not configured."""

    status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    code = "provider_unavailable"


class RateLimited(AIError):
    """The AI provider rate limit was exceeded."""

    status_code = status.HTTP_429_TOO_MANY_REQUESTS
    code = "rate_limited"


class InvalidPrompt(AIError):
    """The requested prompt is missing or has unfilled variables."""

    status_code = status.HTTP_400_BAD_REQUEST
    code = "invalid_prompt"


class ContextTooLarge(AIError):
    """The built context exceeds the model's input limit."""

    status_code = status.HTTP_413_REQUEST_ENTITY_TOO_LARGE
    code = "context_too_large"


class InvalidResponse(AIError):
    """The AI provider returned no schema-conformant output (refusal/empty)."""

    status_code = status.HTTP_502_BAD_GATEWAY
    code = "invalid_response"


def to_http_exception(err: AIError) -> HTTPException:
    """Map any :class:`AIError` to a FastAPI ``HTTPException``."""
    return HTTPException(
        status_code=err.status_code,
        detail={"code": err.code, "message": err.message},
    )
