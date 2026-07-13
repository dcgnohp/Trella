"""Structured logging for AI calls.

Logs operational metadata only — feature, provider, model, latency, token
usage, outcome. Never logs prompt or completion content
(``.ai/AI_ARCHITECTURE.md`` §12–13).
"""

from __future__ import annotations

import logging

logger = logging.getLogger("app.ai")


def log_ai_call(
    *,
    feature: str,
    provider: str,
    model: str,
    latency_ms: int,
    prompt_tokens: int | None = None,
    completion_tokens: int | None = None,
    total_tokens: int | None = None,
    prompt_version: str = "",
    response_model_version: str = "",
    ok: bool = True,
) -> None:
    """Emit one structured record for an AI call. No content is included."""
    logger.info(
        "ai_call feature=%s provider=%s model=%s latency_ms=%d "
        "prompt_tokens=%s completion_tokens=%s total_tokens=%s "
        "prompt_version=%s response_model_version=%s ok=%s",
        feature,
        provider,
        model,
        latency_ms,
        prompt_tokens,
        completion_tokens,
        total_tokens,
        prompt_version,
        response_model_version,
        ok,
    )


def emit_event(event: str, **fields: object) -> None:
    """Emit one structured telemetry line (e.g. ``AI_REQUEST_STARTED``).

    Analytics can later parse these without a refactor. Callers pass only
    non-sensitive fields — prompt/completion content is never included.
    """
    # ponytail: telemetry is a structured log line for now; upgrade path is a
    # real event sink (e.g. OpenTelemetry) without changing this call site.
    extra = " ".join(f"{k}={v}" for k, v in fields.items())
    logger.info("ai_event event=%s %s", event, extra)
