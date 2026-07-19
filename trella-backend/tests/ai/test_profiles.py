"""P6-B9 check: profile resolution + middleware assembly per environment.

Covers:
* ``resolve_profile``: explicit AI_PROFILE override wins; ENVIRONMENT mapping.
* ``build_middlewares``: exact ordered stack per profile (PRODUCTION full stack,
  TESTING empty, DEVELOPMENT cache+retry+telemetry+cost).
* Functional: a service built with the PRODUCTION stack still runs end-to-end.
"""

import asyncio
from pathlib import Path
from types import SimpleNamespace

import pytest

from app.ai.config.profiles import (
    AIProfile,
    build_middlewares,
    get_profile_config,
    resolve_profile,
)
from app.ai.pipeline.middleware import (
    CacheMiddleware,
    CostMiddleware,
    MetricsMiddleware,
    RetryMiddleware,
    TracingMiddleware,
)
from app.ai.prompts.prompt_manager import PromptManager
from app.ai.providers.base import AIProvider, GenerationResult
from app.ai.services.ai_base_service import AIBaseService


def _settings(**kwargs: object) -> SimpleNamespace:
    base: dict[str, object] = {
        "AI_PROFILE": None,
        "ENVIRONMENT": "local",
        "AI_MODEL_PRICING": {},
    }
    base.update(kwargs)
    return SimpleNamespace(**base)


# --- resolve_profile -------------------------------------------------------


def test_explicit_profile_wins_over_environment() -> None:
    s = _settings(AI_PROFILE="production", ENVIRONMENT="local")
    assert resolve_profile(s) is AIProfile.PRODUCTION


def test_explicit_profile_case_insensitive() -> None:
    assert resolve_profile(_settings(AI_PROFILE="PRODUCTION")) is AIProfile.PRODUCTION


@pytest.mark.parametrize(
    ("environment", "expected"),
    [
        ("production", AIProfile.PRODUCTION),
        ("staging", AIProfile.DEVELOPMENT),
        ("local", AIProfile.TESTING),
        ("test", AIProfile.TESTING),
        ("anything-else", AIProfile.TESTING),
    ],
)
def test_environment_mapping(environment: str, expected: AIProfile) -> None:
    assert resolve_profile(_settings(ENVIRONMENT=environment)) is expected


# --- build_middlewares -----------------------------------------------------


def test_production_stack_is_ordered_full_stack() -> None:
    mws = build_middlewares(_settings(AI_PROFILE="production"))
    assert [type(m) for m in mws] == [
        TracingMiddleware,
        MetricsMiddleware,
        CacheMiddleware,
        RetryMiddleware,
        CostMiddleware,
    ]


def test_metrics_is_outside_cost() -> None:
    # Cost (inner) sets result.cost on unwind; Metrics (outer) reads it.
    mws = build_middlewares(_settings(AI_PROFILE="production"))
    metrics_i = next(i for i, m in enumerate(mws) if isinstance(m, MetricsMiddleware))
    cost_i = next(i for i, m in enumerate(mws) if isinstance(m, CostMiddleware))
    assert metrics_i < cost_i


def test_cache_is_outside_retry() -> None:
    mws = build_middlewares(_settings(AI_PROFILE="production"))
    cache_i = next(i for i, m in enumerate(mws) if isinstance(m, CacheMiddleware))
    retry_i = next(i for i, m in enumerate(mws) if isinstance(m, RetryMiddleware))
    assert cache_i < retry_i


def test_testing_stack_is_empty() -> None:
    assert build_middlewares(_settings(ENVIRONMENT="local")) == []
    assert build_middlewares(_settings(AI_PROFILE="testing")) == []


def test_development_stack_has_telemetry_cache_retry_cost() -> None:
    mws = build_middlewares(_settings(AI_PROFILE="development"))
    types_ = {type(m) for m in mws}
    assert types_ == {
        TracingMiddleware,
        MetricsMiddleware,
        CacheMiddleware,
        RetryMiddleware,
        CostMiddleware,
    }


def test_development_config_values() -> None:
    cfg = get_profile_config(AIProfile.DEVELOPMENT)
    assert cfg.retry_attempts == 2
    assert cfg.cache_ttl_s == 60


# --- functional ------------------------------------------------------------


class _FakeProvider(AIProvider):
    name = "fake"

    async def generate(
        self,
        *,
        prompt: str,
        model: str | None = None,
        temperature: float = 0.0,
        max_tokens: int | None = None,
        timeout: float | None = None,
    ) -> GenerationResult:
        return GenerationResult(
            content="pong",
            model="gpt-4.1",
            provider="fake",
            prompt_tokens=1,
            completion_tokens=1,
        )

    async def health_check(self) -> bool:
        return True


def test_production_pipeline_assembles_and_runs(tmp_path: Path) -> None:
    (tmp_path / "greet.md").write_text("Hello {{name}}")
    mws = build_middlewares(_settings(AI_PROFILE="production"))
    service = AIBaseService(
        _FakeProvider(), PromptManager(prompts_dir=tmp_path), middlewares=mws
    )
    resp = asyncio.run(service.run(prompt_name="greet", variables={"name": "Ada"}))
    assert resp.content == "pong"
    assert resp.provider == "fake"
