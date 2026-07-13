"""B1 check: every AIError maps to a distinct, correct HTTP status."""

import pytest

from app.ai.utils.errors import (
    AIError,
    ContextTooLarge,
    InvalidPrompt,
    ProviderTimeout,
    ProviderUnavailable,
    RateLimited,
    to_http_exception,
)

_CASES = [
    (ProviderTimeout, 504, "provider_timeout"),
    (ProviderUnavailable, 503, "provider_unavailable"),
    (RateLimited, 429, "rate_limited"),
    (InvalidPrompt, 400, "invalid_prompt"),
    (ContextTooLarge, 413, "context_too_large"),
]


@pytest.mark.parametrize(("err_cls", "status", "code"), _CASES)
def test_error_maps_to_http(err_cls: type[AIError], status: int, code: str) -> None:
    exc = to_http_exception(err_cls("boom"))
    assert exc.status_code == status
    assert exc.detail == {"code": code, "message": "boom"}


def test_default_message_falls_back_to_docstring() -> None:
    # No explicit message -> first line of the docstring is used, never empty.
    assert RateLimited().message
    assert isinstance(RateLimited(), AIError)


def test_status_codes_are_unique() -> None:
    codes = [status for _, status, _ in _CASES]
    assert len(codes) == len(set(codes))
