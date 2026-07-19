"""Tests for the AI feature registry (P1-B2).

Verify the enum stays a pure identifier, the registry maps features to the
correct config, model-tier resolution reads from ``settings``, and unknown
features fail loudly.
"""

from __future__ import annotations

import dataclasses

import pytest

from app.ai.registry import (
    AIFeature,
    FeatureConfig,
    get_feature_config,
    get_structured_config,
    resolve_model,
)
from app.ai.schemas.docs_ai_schema import DocSummaryResponse
from app.ai.schemas.project_ai_schema import ProjectAssistantResponse
from app.ai.schemas.sprint_ai_schema import SprintAnalysisResponse
from app.ai.schemas.task_ai_schema import DescriptionResponse, SummaryResponse
from app.core.config import settings


def test_ai_feature_is_pure_identifier() -> None:
    # Members are just (name -> str value); no config attributes leak onto them.
    assert AIFeature.GENERATE_DESCRIPTION.value == "generate_description"
    assert AIFeature.SUMMARIZE.value == "summarize"
    config_fields = {f.name for f in dataclasses.fields(FeatureConfig)}
    for member in AIFeature:
        for field in config_fields:
            assert not hasattr(member, field), f"{member} leaks config attr {field}"


def test_get_feature_config_generate_description() -> None:
    config = get_feature_config(AIFeature.GENERATE_DESCRIPTION)
    assert config.capability == "structured"
    assert config.prompt_name == "description_generator"
    assert config.model_tier == "mini"
    assert config.temperature == 0.3
    assert config.max_tokens is None
    assert config.response_model is DescriptionResponse
    assert config.prompt_version == "v1"
    assert config.response_schema_version == "v1"


def test_get_feature_config_summarize() -> None:
    config = get_feature_config(AIFeature.SUMMARIZE)
    assert config.prompt_name == "description_summary"
    assert config.model_tier == "mini"
    assert config.temperature == 0.2
    assert config.max_tokens is None
    assert config.response_model is SummaryResponse
    assert config.prompt_version == "v1"
    assert config.response_schema_version == "v1"


def test_get_feature_config_summarize_document() -> None:
    config = get_feature_config(AIFeature.SUMMARIZE_DOCUMENT)
    assert config.prompt_name == "document_summary"
    assert config.model_tier == "mini"
    assert config.temperature == 0.2
    assert config.max_tokens is None
    assert config.response_model is DocSummaryResponse
    assert config.prompt_version == "v1"
    assert config.response_schema_version == "v1"


def test_resolve_model_maps_tiers_to_settings() -> None:
    assert resolve_model("mini", settings) == settings.AI_MINI_MODEL
    assert resolve_model("default", settings) == settings.AI_DEFAULT_MODEL


def test_unknown_feature_raises_value_error() -> None:
    with pytest.raises(ValueError, match="No FeatureConfig registered"):
        get_feature_config("nope")  # type: ignore[arg-type]


def test_chat_config_is_streaming_without_response_model() -> None:
    config = get_feature_config(AIFeature.CHAT)
    assert config.capability == "streaming"
    assert config.response_model is None
    assert config.prompt_name == "chat"
    assert config.model_tier == "default"
    assert config.temperature == 0.4
    assert config.prompt_version == "v1"
    assert config.response_schema_version == "v1"


def test_structured_feature_has_response_model() -> None:
    config = get_feature_config(AIFeature.GENERATE_DESCRIPTION)
    assert config.capability == "structured"
    assert config.response_model is not None


def test_get_structured_config_rejects_streaming_feature() -> None:
    with pytest.raises(ValueError, match="not a structured feature"):
        get_structured_config(AIFeature.CHAT)


def test_get_structured_config_returns_structured_config() -> None:
    config = get_structured_config(AIFeature.GENERATE_DESCRIPTION)
    assert config.capability == "structured"
    assert config.response_model is DescriptionResponse


def test_analytics_features_are_structured_on_default_tier() -> None:
    expected = {
        AIFeature.SPRINT_ANALYSIS: SprintAnalysisResponse,
        AIFeature.PROJECT_ASSISTANT: ProjectAssistantResponse,
    }
    for feature, response_model in expected.items():
        config = get_structured_config(feature)  # must not raise
        assert config.capability == "structured"
        assert config.response_model is response_model
        assert config.response_model is not None
        assert config.model_tier == "default"
        assert resolve_model(config.model_tier, settings) == settings.AI_DEFAULT_MODEL
        assert config.prompt_version == "v2"
        assert config.response_schema_version == "v2"
