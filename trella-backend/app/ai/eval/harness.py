"""Offline prompt evaluation harness.

Renders a feature's prompt (via :class:`PromptManager` + the feature registry)
and runs it through :meth:`AIBaseService.run_structured` with a FAKE provider —
no real LLM, no network. Each case asserts the parsed output is a valid instance
of the response model with every required field present and non-empty.

Kept dependency-free: only stdlib + the AI platform's own modules. This is a
library used by tests, not a service.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from pydantic import ValidationError

from app.ai.prompts.prompt_manager import PromptManager
from app.ai.providers.base import AIProvider
from app.ai.registry import (
    AIFeature,
    get_feature_config,
    get_structured_config,
)
from app.ai.services.ai_base_service import AIBaseService
from app.ai.utils.errors import AIError
from app.core.base import CamelModel


@dataclass(frozen=True)
class CaseResult:
    """Outcome of evaluating one case."""

    index: int
    passed: bool
    reason: str | None = None


@dataclass(frozen=True)
class EvalReport:
    """Aggregate result for one feature/version over a list of cases."""

    feature: str
    version: str
    cases: list[CaseResult] = field(default_factory=list)

    @property
    def passed(self) -> int:
        return sum(1 for c in self.cases if c.passed)

    @property
    def failed(self) -> int:
        return sum(1 for c in self.cases if not c.passed)

    @property
    def ok(self) -> bool:
        return self.failed == 0 and len(self.cases) > 0


def _is_empty(value: object) -> bool:
    """A required field is 'empty' if it is None, blank string, or empty set."""
    if value is None:
        return True
    if isinstance(value, str):
        return value.strip() == ""
    if isinstance(value, (list, tuple, set, dict)):
        return len(value) == 0
    return False


def _empty_required_fields(parsed: CamelModel) -> list[str]:
    """Return names of required fields on ``parsed`` that are empty."""
    empty: list[str] = []
    for name, info in type(parsed).model_fields.items():
        if info.is_required() and _is_empty(getattr(parsed, name, None)):
            empty.append(name)
    return empty


async def evaluate_prompt(
    feature: AIFeature,
    response_model: type[CamelModel],
    fake_provider: AIProvider,
    cases: list[dict[str, str]],
    *,
    version: str | None = None,
    prompt_manager: PromptManager | None = None,
) -> EvalReport:
    """Evaluate ``feature``'s prompt over ``cases`` with a fake provider.

    For each case (a ``{{var}}`` → value mapping) the harness:

    1. renders the feature's prompt at the resolved ``version`` (proving version
       resolution + variable substitution work for this case);
    2. runs it through :meth:`AIBaseService.run_structured` with the fake
       provider to obtain a parsed model;
    3. flags the case failed if the result is not an instance of
       ``response_model`` or any required field is empty.

    ``version`` defaults to the feature's registered ``prompt_version``.

    ponytail: ``run_structured`` re-renders the prompt internally without a
    version arg (the service is intentionally untouched), but the fake provider
    ignores prompt content, so version fidelity is what step 1 verifies.
    """
    config = get_feature_config(feature)
    resolved_version = version or config.prompt_version
    pm = prompt_manager or PromptManager()
    service = AIBaseService(fake_provider, pm)

    results: list[CaseResult] = []
    for index, variables in enumerate(cases):
        try:
            # 1. Prove the versioned prompt renders with these variables.
            pm.render(config.prompt_name, variables, version=resolved_version)
            # 2. Obtain the structured output via the fake provider.
            parsed = await service.run_structured(
                prompt_name=config.prompt_name,
                variables=variables,
                response_model=response_model,
                feature=feature.value,
                temperature=config.temperature,
                max_tokens=config.max_tokens,
                timeout=config.timeout,
                prompt_version=resolved_version,
                response_schema_version=config.response_schema_version,
            )
        except (AIError, ValidationError) as exc:
            results.append(CaseResult(index, False, f"{type(exc).__name__}: {exc}"))
            continue

        # 3. Validate the parsed output shape.
        if not isinstance(parsed, response_model):
            results.append(
                CaseResult(index, False, f"not a {response_model.__name__} instance")
            )
            continue
        empty = _empty_required_fields(parsed)
        if empty:
            results.append(CaseResult(index, False, f"empty required fields: {empty}"))
            continue
        results.append(CaseResult(index, True))

    return EvalReport(feature=feature.value, version=resolved_version, cases=results)


async def compare_versions(
    feature: AIFeature,
    version_a: str,
    version_b: str,
    fake_provider: AIProvider,
    cases: list[dict[str, str]],
    *,
    prompt_manager: PromptManager | None = None,
) -> tuple[EvalReport, EvalReport]:
    """Evaluate two prompt versions of ``feature`` side by side.

    The response model is taken from the feature's structured registry config,
    so callers only supply the two versions to compare. Returns
    ``(report_a, report_b)``.
    """
    response_model = get_structured_config(feature).response_model
    assert response_model is not None  # guaranteed by get_structured_config
    report_a = await evaluate_prompt(
        feature,
        response_model,
        fake_provider,
        cases,
        version=version_a,
        prompt_manager=prompt_manager,
    )
    report_b = await evaluate_prompt(
        feature,
        response_model,
        fake_provider,
        cases,
        version=version_b,
        prompt_manager=prompt_manager,
    )
    return report_a, report_b
