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
from app.ai.schemas.project_ai_schema import ProjectAssistantResponse
from app.ai.schemas.sprint_ai_schema import SprintAnalysisResponse
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
    CHAT = "chat"
    SPRINT_ANALYSIS = "sprint_analysis"
    PROJECT_ASSISTANT = "project_assistant"


@dataclass(frozen=True)
class FeatureConfig:
    """Runtime configuration for one AI feature (kept off the enum).

    ``capability`` distinguishes the two feature shapes: ``"structured"``
    features carry a ``response_model`` (the AI output is validated into a
    schema); ``"streaming"`` features (chat) emit free text and leave
    ``response_model`` as ``None``. Use ``get_structured_config`` to read a
    structured feature so the None-branching stays in one place.
    """

    capability: Literal["structured", "streaming"]
    prompt_name: str
    model_tier: Literal["mini", "default"]
    temperature: float
    max_tokens: int | None
    timeout: float | None
    response_model: type[CamelModel] | None
    prompt_version: str
    response_schema_version: str


_REGISTRY: dict[AIFeature, FeatureConfig] = {
    AIFeature.GENERATE_DESCRIPTION: FeatureConfig(
        "structured", "description_generator", "mini", 0.3, None, None, DescriptionResponse, "v1", "v1"
    ),
    AIFeature.SUMMARIZE: FeatureConfig(
        "structured", "description_summary", "mini", 0.2, None, None, SummaryResponse, "v1", "v1"
    ),
    AIFeature.BREAK_DOWN_TASK: FeatureConfig(
        "structured", "task_breakdown", "default", 0.4, None, None, BreakdownResponse, "v1", "v1"
    ),
    AIFeature.ESTIMATE_STORY_POINT: FeatureConfig(
        "structured", "story_point", "default", 0.2, None, None, StoryPointResponse, "v1", "v1"
    ),
    AIFeature.SUMMARIZE_DOCUMENT: FeatureConfig(
        "structured", "document_summary", "mini", 0.2, None, None, DocSummaryResponse, "v1", "v1"
    ),
    AIFeature.CHAT: FeatureConfig(
        "streaming", "chat", "default", 0.4, None, None, None, "v1", "v1"
    ),
    AIFeature.SPRINT_ANALYSIS: FeatureConfig(
        "structured", "sprint_analysis", "default", 0.3, None, None, SprintAnalysisResponse, "v1", "v1"
    ),
    AIFeature.PROJECT_ASSISTANT: FeatureConfig(
        "structured", "project_assistant", "default", 0.3, None, None, ProjectAssistantResponse, "v1", "v1"
    ),
}


def get_feature_config(feature: AIFeature) -> FeatureConfig:
    """Return the config for ``feature``, or raise ``ValueError`` if unknown."""
    try:
        return _REGISTRY[feature]
    except KeyError as exc:
        raise ValueError(f"No FeatureConfig registered for feature: {feature!r}") from exc


def get_structured_config(feature: AIFeature) -> FeatureConfig:
    """Return a structured feature's config, guaranteeing ``response_model``.

    Concentrates the structured/streaming distinction: raises ``ValueError`` if
    ``feature`` is not a structured capability or is missing a response model,
    so structured call sites never have to branch on ``response_model is None``.
    """
    config = get_feature_config(feature)
    if config.capability != "structured" or config.response_model is None:
        raise ValueError(f"Feature is not a structured feature with a response_model: {feature!r}")
    return config


def resolve_model(tier: Literal["mini", "default"], settings: Settings) -> str:
    """Resolve a model tier to a concrete model name from ``settings``."""
    return settings.AI_MINI_MODEL if tier == "mini" else settings.AI_DEFAULT_MODEL
