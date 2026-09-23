"""Offline prompt evaluation harness (Phase 6, P6-B8).

Network-free, dependency-free helpers for exercising a feature's prompt against
a FAKE/recorded provider and asserting the parsed structured output is valid.
Used by tests; never calls a real LLM.
"""

from app.ai.eval.harness import (
    CaseResult,
    EvalReport,
    compare_versions,
    evaluate_prompt,
)

__all__ = [
    "CaseResult",
    "EvalReport",
    "compare_versions",
    "evaluate_prompt",
]
