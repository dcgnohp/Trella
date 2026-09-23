"""AI configuration profiles (P6-B9): assemble the middleware pipeline per env.

This is the final Phase 6 task. It maps an environment/profile to a concrete,
*ordered* middleware stack so the router can wire the right cross-cutting
concerns without hand-assembling them.

Middleware order (outer -> inner), and why:

    Tracing -> Metrics -> Cache -> Retry -> Cost

* Tracing/Metrics are outermost so they measure the *whole* call, including any
  retries and cache lookups.
* Cache sits outside Retry so a cache hit short-circuits both the provider call
  and the retry loop.
* Retry wraps the provider so only the provider invocation is retried.
* Cost is innermost so ``AIResult.cost`` is populated on the unwind *before*
  Metrics (outer) reads it -- Metrics must therefore be OUTSIDE Cost.

Other resilience layers (rate limiting, circuit breaking, provider failover) are
configured at their own layers -- rate limiting at the router boundary
(``require_ai_access``), circuit breaking + failover inside the provider factory
(``get_provider``) -- so they are intentionally NOT part of this stack.

The TESTING profile resolves to an EMPTY stack: a pass-through pipeline keeps the
unit/router suite deterministic (no telemetry side effects, no caching, no
sleeps) and identical to a direct provider call.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum

from app.ai.pipeline import AIMiddleware
from app.ai.pipeline.middleware import (
    CacheMiddleware,
    CostMiddleware,
    MetricsMiddleware,
    RetryMiddleware,
    TracingMiddleware,
)
from app.ai.telemetry import get_metrics_collector, get_tracing_collector
from app.ai.utils.cache import TTLCache
from app.core.config import Settings


class AIProfile(str, Enum):
    """Named middleware assembly profiles."""

    DEVELOPMENT = "development"
    PRODUCTION = "production"
    TESTING = "testing"


@dataclass(frozen=True)
class ProfileConfig:
    """Knobs for one profile's middleware stack.

    ``telemetry_enabled`` toggles Tracing + Metrics together (per-request spans
    and aggregate counters). ``cost_enabled`` toggles the Cost middleware.

    Rate limiting, circuit breaking and provider failover are configured at
    their own layers (router boundary / provider factory) and are deliberately
    not represented here.
    """

    retry_attempts: int
    retry_base_delay_s: float
    cache_enabled: bool
    cache_ttl_s: float
    telemetry_enabled: bool  # metrics + tracing
    cost_enabled: bool


_PROFILES: dict[AIProfile, ProfileConfig] = {
    AIProfile.PRODUCTION: ProfileConfig(
        retry_attempts=3,
        retry_base_delay_s=0.5,
        cache_enabled=True,
        cache_ttl_s=300,
        telemetry_enabled=True,
        cost_enabled=True,
    ),
    AIProfile.DEVELOPMENT: ProfileConfig(
        retry_attempts=2,
        retry_base_delay_s=0.0,
        cache_enabled=True,
        cache_ttl_s=60,
        telemetry_enabled=True,
        cost_enabled=True,
    ),
    AIProfile.TESTING: ProfileConfig(
        retry_attempts=1,
        retry_base_delay_s=0.0,
        cache_enabled=False,
        cache_ttl_s=0,
        telemetry_enabled=False,
        cost_enabled=False,
    ),
}


def get_profile_config(profile: AIProfile) -> ProfileConfig:
    """Return the :class:`ProfileConfig` for ``profile``."""
    return _PROFILES[profile]


# ENVIRONMENT -> profile. Anything not listed (local/test/unknown) is TESTING so
# the suite and local dev get a deterministic pass-through pipeline by default.
_ENVIRONMENT_PROFILES: dict[str, AIProfile] = {
    "production": AIProfile.PRODUCTION,
    "staging": AIProfile.DEVELOPMENT,
}


def resolve_profile(settings: Settings) -> AIProfile:
    """Resolve the active profile.

    An explicit ``settings.AI_PROFILE`` (case-insensitive) always wins; otherwise
    ``settings.ENVIRONMENT`` is mapped: production -> PRODUCTION,
    staging -> DEVELOPMENT, everything else (local/test) -> TESTING.
    """
    explicit = getattr(settings, "AI_PROFILE", None)
    if explicit:
        return AIProfile(str(explicit).lower())
    environment = str(getattr(settings, "ENVIRONMENT", "") or "").lower()
    return _ENVIRONMENT_PROFILES.get(environment, AIProfile.TESTING)


def build_middlewares(
    settings: Settings,
    *,
    cache: TTLCache | None = None,
    pricing: dict[str, dict[str, float]] | None = None,
) -> list[AIMiddleware]:
    """Assemble the ordered middleware stack for the resolved profile.

    Order (outer -> inner): Tracing, Metrics, Cache, Retry, Cost. See the module
    docstring for the rationale. TESTING resolves to an EMPTY list.
    """
    cfg = get_profile_config(resolve_profile(settings))

    middlewares: list[AIMiddleware] = []
    if cfg.telemetry_enabled:
        middlewares.append(TracingMiddleware(get_tracing_collector()))
        middlewares.append(MetricsMiddleware(get_metrics_collector()))
    if cfg.cache_enabled:
        middlewares.append(CacheMiddleware(cache or TTLCache(ttl_s=cfg.cache_ttl_s)))
    if cfg.retry_attempts > 1:
        middlewares.append(RetryMiddleware(cfg.retry_attempts, cfg.retry_base_delay_s))
    if cfg.cost_enabled:
        middlewares.append(CostMiddleware(pricing or settings.AI_MODEL_PRICING))
    return middlewares
