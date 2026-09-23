"""B7 check: base service renders prompt, returns AIResponse, logs no content."""

import asyncio
import logging
from pathlib import Path

import pytest

from app.ai.prompts.prompt_manager import PromptManager
from app.ai.providers.base import AIProvider, GenerationResult
from app.ai.services.ai_base_service import AIBaseService
from app.ai.utils.errors import RateLimited


class _FakeProvider(AIProvider):
    name = "fake"

    def __init__(
        self, result: GenerationResult | None = None, exc: Exception | None = None
    ) -> None:
        self._result = result
        self._exc = exc
        self.seen_prompt: str | None = None

    async def generate(
        self,
        *,
        prompt: str,
        model: str | None = None,
        temperature: float = 0.0,
        max_tokens: int | None = None,
        timeout: float | None = None,
    ) -> GenerationResult:
        self.seen_prompt = prompt
        if self._exc is not None:
            raise self._exc
        assert self._result is not None
        return self._result

    async def health_check(self) -> bool:
        return True


def _service(provider: AIProvider, tmp_path: Path) -> AIBaseService:
    (tmp_path / "greet.md").write_text("Hello {{name}}")
    return AIBaseService(provider, PromptManager(prompts_dir=tmp_path))


def test_run_renders_prompt_and_returns_response(tmp_path: Path) -> None:
    provider = _FakeProvider(
        GenerationResult(
            content="hi there",
            model="gpt-4.1-mini",
            provider="fake",
            prompt_tokens=2,
            completion_tokens=3,
        )
    )
    resp = asyncio.run(
        _service(provider, tmp_path).run(prompt_name="greet", variables={"name": "Ada"})
    )
    assert provider.seen_prompt == "Hello Ada"
    assert resp.content == "hi there"
    assert resp.provider == "fake"
    assert resp.latency_ms >= 0


def test_provider_error_propagates(tmp_path: Path) -> None:
    provider = _FakeProvider(exc=RateLimited("slow down"))
    with pytest.raises(RateLimited):
        asyncio.run(
            _service(provider, tmp_path).run(
                prompt_name="greet", variables={"name": "Ada"}
            )
        )


def test_logs_metadata_but_not_content(
    tmp_path: Path, caplog: pytest.LogCaptureFixture
) -> None:
    provider = _FakeProvider(
        GenerationResult(content="TOP-SECRET-BODY", model="m", provider="fake")
    )
    with caplog.at_level(logging.INFO, logger="app.ai"):
        asyncio.run(
            _service(provider, tmp_path).run(
                prompt_name="greet", variables={"name": "Ada"}, feature="unit"
            )
        )
    text = "\n".join(r.getMessage() for r in caplog.records)
    assert "ai_call" in text
    assert "feature=unit" in text
    assert "TOP-SECRET-BODY" not in text  # content is never logged
