"""P1-B1 checks: native structured outputs, token usage, telemetry logging.

No network: the OpenAI SDK client is faked (mirrors ``test_openai_provider.py``)
and a fake provider drives the service. Sync tests use ``asyncio.run``.
"""

import asyncio
import logging
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest

from app.ai.prompts.prompt_manager import PromptManager
from app.ai.providers.base import AIProvider, StructuredResult
from app.ai.providers.openai_provider import OpenAIProvider
from app.ai.services.ai_base_service import AIBaseService
from app.ai.utils.errors import InvalidResponse
from app.core.base import CamelModel


class _Desc(CamelModel):
    """Minimal structured schema for tests."""

    description: str


class _FakeParse:
    """Replays a scripted ParsedChatCompletion-like object."""

    def __init__(self, resp: Any) -> None:
        self.calls = 0
        self._resp = resp

    async def __call__(self, **_: Any) -> Any:
        self.calls += 1
        return self._resp


def _client(parse: _FakeParse) -> Any:
    return SimpleNamespace(
        beta=SimpleNamespace(
            chat=SimpleNamespace(completions=SimpleNamespace(parse=parse))
        )
    )


def _parsed_response(parsed: Any, refusal: str | None = None) -> Any:
    return SimpleNamespace(
        choices=[
            SimpleNamespace(
                message=SimpleNamespace(parsed=parsed, refusal=refusal)
            )
        ],
        usage=SimpleNamespace(prompt_tokens=7, completion_tokens=11, total_tokens=18),
    )


def _provider(parse: _FakeParse) -> OpenAIProvider:
    return OpenAIProvider(
        api_key="x",
        default_model="gpt-4.1-mini",
        timeout=5.0,
        max_retries=2,
        client=_client(parse),
    )


def test_generate_structured_happy_path() -> None:
    parse = _FakeParse(_parsed_response(_Desc(description="do the thing")))
    result = asyncio.run(
        _provider(parse).generate_structured(
            prompt="hello", response_model=_Desc
        )
    )
    assert isinstance(result, StructuredResult)
    assert result.parsed.description == "do the thing"
    assert result.provider == "openai"
    assert result.prompt_tokens == 7
    assert result.completion_tokens == 11
    assert result.total_tokens == 18
    assert parse.calls == 1


def test_refusal_maps_to_invalid_response() -> None:
    parse = _FakeParse(_parsed_response(None, refusal="cannot comply"))
    with pytest.raises(InvalidResponse):
        asyncio.run(
            _provider(parse).generate_structured(prompt="x", response_model=_Desc)
        )


def test_none_parsed_maps_to_invalid_response() -> None:
    parse = _FakeParse(_parsed_response(None, refusal=None))
    with pytest.raises(InvalidResponse):
        asyncio.run(
            _provider(parse).generate_structured(prompt="x", response_model=_Desc)
        )


class _FakeStructuredProvider(AIProvider):
    name = "fake"

    def __init__(self) -> None:
        self.seen_prompt: str | None = None

    async def generate(self, **_: Any) -> Any:  # pragma: no cover - unused
        raise NotImplementedError

    async def generate_structured(
        self,
        *,
        prompt: str,
        response_model: type[Any],
        model: str | None = None,
        temperature: float = 0.0,
        max_tokens: int | None = None,
        timeout: float | None = None,
    ) -> StructuredResult[Any]:
        self.seen_prompt = prompt
        return StructuredResult(
            parsed=response_model(description="SECRET-CONTENT"),
            model="gpt-4.1-mini",
            provider=self.name,
            prompt_tokens=1,
            completion_tokens=2,
            total_tokens=3,
        )

    async def health_check(self) -> bool:
        return True


def _service(provider: AIProvider, tmp_path: Path) -> AIBaseService:
    (tmp_path / "gen.md").write_text("Describe {{title}}")
    return AIBaseService(provider, PromptManager(prompts_dir=tmp_path))


def test_run_structured_renders_and_returns_parsed(
    tmp_path: Path, caplog: pytest.LogCaptureFixture
) -> None:
    provider = _FakeStructuredProvider()
    with caplog.at_level(logging.INFO, logger="app.ai"):
        parsed = asyncio.run(
            _service(provider, tmp_path).run_structured(
                prompt_name="gen",
                variables={"title": "Login page"},
                response_model=_Desc,
                feature="generate_description",
                prompt_version="v1",
                response_schema_version="v2",
            )
        )
    assert isinstance(parsed, _Desc)
    assert provider.seen_prompt == "Describe Login page"

    text = "\n".join(r.getMessage() for r in caplog.records)
    assert "prompt_version=v1" in text
    assert "response_model_version=v2" in text
    assert "total_tokens=3" in text
    assert "AI_REQUEST_STARTED" in text
    assert "AI_REQUEST_SUCCESS" in text
    # Content must never be logged.
    assert "SECRET-CONTENT" not in text
    assert "Login page" not in text
