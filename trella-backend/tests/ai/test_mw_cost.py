"""P6-B5 checks: CostMiddleware.

Verifies cost estimation from token usage against a per-model pricing table
(``$ per 1K tokens``): a known model with tokens yields the computed cost, an
unknown model yields ``None`` (no crash), and both-tokens-``None`` yields
``None``. Also confirms the pricing table is empty by default in ``Settings``.
"""

import asyncio

from app.ai.pipeline import AICallContext, AIPipeline, AIResult
from app.ai.pipeline.middleware.cost import CostMiddleware
from app.core.config import settings

_PRICING = {"gpt-4.1": {"input": 0.005, "output": 0.015}}


def _ctx() -> AICallContext:
    return AICallContext(
        kind="generate", feature="t", model=None, params={}, payload={}
    )


def _run(result: AIResult, pricing: dict[str, dict[str, float]]) -> AIResult:
    pipeline = AIPipeline([CostMiddleware(pricing)])

    async def terminal(_c: AICallContext) -> AIResult:
        return result

    return asyncio.run(pipeline.execute(_ctx(), terminal))


def test_known_model_computes_cost() -> None:
    result = AIResult(
        model="gpt-4.1",
        provider="openai",
        usage={"prompt_tokens": 1000, "completion_tokens": 500, "total_tokens": 1500},
    )
    out = _run(result, _PRICING)
    # 1000/1000*0.005 + 500/1000*0.015 = 0.005 + 0.0075 = 0.0125
    assert out.cost == 0.0125


def test_unknown_model_yields_none() -> None:
    result = AIResult(
        model="mystery-model",
        provider="openai",
        usage={"prompt_tokens": 1000, "completion_tokens": 500},
    )
    assert _run(result, _PRICING).cost is None


def test_both_tokens_none_yields_none() -> None:
    result = AIResult(
        model="gpt-4.1",
        provider="openai",
        usage={"prompt_tokens": None, "completion_tokens": None},
    )
    assert _run(result, _PRICING).cost is None


def test_pricing_table_empty_by_default() -> None:
    assert settings.AI_MODEL_PRICING == {}
