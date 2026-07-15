"""Feature registry: identifier vs. runtime configuration.

``AIFeature`` is a **pure identifier** — a string enum and nothing more; it
carries no runtime config. Everything that varies per feature (prompt name,
model tier, sampling params, response schema, versions) lives in a separate
``FeatureConfig`` dataclass keyed by ``AIFeature`` in ``_REGISTRY``. Services
resolve the concrete model at call time from ``settings`` so model names are
never hardcoded here (``.ai/AI_ARCHITECTURE.md`` §5).
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Literal

from app.ai.schemas.docs_ai_schema import DocSummaryResponse
from app.ai.schemas.task_ai_schema import (
    BreakdownResponse,
    DescriptionResponse,
    StoryPointResponse,
    SummaryResponse,
)
from app.core.base import CamelModel
from app.core.config import Settings


class AIFeature(str, Enum):
    """Pure feature identifier. No configuration lives on the enum."""

    GENERATE_DESCRIPTION = "generate_description"
    SUMMARIZE = "summarize"
    BREAK_DOWN_TASK = "break_down_task"
    ESTIMATE_STORY_POINT = "estimate_story_point"
    SUMMARIZE_DOCUMENT = "summarize_document"


@dataclass(frozen=True)
class FeatureConfig:
    """Runtime configuration for one AI feature (kept off the enum)."""

    prompt_name: str
    model_tier: Literal["mini", "default"]
    temperature: float
    max_tokens: int | None
    timeout: float | None
    response_model: type[CamelModel]
    prompt_version: str
    response_schema_version: str


_REGISTRY: dict[AIFeature, FeatureConfig] = {
    AIFeature.GENERATE_DESCRIPTION: FeatureConfig(
        "description_generator", "mini", 0.3, None, None, DescriptionResponse, "v1", "v1"
    ),
    AIFeature.SUMMARIZE: FeatureConfig(
        "description_summary", "mini", 0.2, None, None, SummaryResponse, "v1", "v1"
    ),
    AIFeature.BREAK_DOWN_TASK: FeatureConfig(
        "task_breakdown", "default", 0.4, None, None, BreakdownResponse, "v1", "v1"
    ),
    AIFeature.ESTIMATE_STORY_POINT: FeatureConfig(
        "story_point", "default", 0.2, None, None, StoryPointResponse, "v1", "v1"
    ),
    AIFeature.SUMMARIZE_DOCUMENT: FeatureConfig(
        "document_summary", "mini", 0.2, None, None, DocSummaryResponse, "v1", "v1"
    ),
}


def get_feature_config(feature: AIFeature) -> FeatureConfig:
    """Return the config for ``feature``, or raise ``ValueError`` if unknown."""
    try:
        return _REGISTRY[feature]
    except KeyError as exc:
        raise ValueError(f"No FeatureConfig registered for feature: {feature!r}") from exc


def resolve_model(tier: Literal["mini", "default"], settings: Settings) -> str:
    """Resolve a model tier to a concrete model name from ``settings``."""
    return settings.AI_MINI_MODEL if tier == "mini" else settings.AI_DEFAULT_MODEL
