"""B6 check: AI schemas serialize camelCase and accept snake_case input."""

from app.ai.schemas.ai_schema import AIRequest, AIResponse, ProviderHealthResponse


def test_request_accepts_snake_and_camel() -> None:
    assert AIRequest(prompt="hi", model="gpt-4.1").model == "gpt-4.1"
    assert AIRequest.model_validate({"prompt": "hi", "variables": {"a": "b"}}).variables == {
        "a": "b"
    }


def test_response_serializes_camel_case() -> None:
    resp = AIResponse(content="ok", model="gpt-4.1", provider="openai", latency_ms=42)
    dumped = resp.model_dump(by_alias=True)
    assert dumped["latencyMs"] == 42
    assert dumped["content"] == "ok"


def test_health_response_fields() -> None:
    health = ProviderHealthResponse(provider="openai", model="gpt-4.1", healthy=False)
    assert health.model_dump(by_alias=True) == {
        "provider": "openai",
        "model": "gpt-4.1",
        "healthy": False,
    }
