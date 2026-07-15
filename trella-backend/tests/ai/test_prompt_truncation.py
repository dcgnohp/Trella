"""P3-B4b checks: oversized-prompt truncation in AIBaseService.

Truncation is applied AFTER the model is resolved, driven by config
(``AI_MAX_PROMPT_CHARS`` + optional per-model ``AI_MODEL_MAX_PROMPT_CHARS``).
No network: a fake provider captures the prompt it receives (mirrors the
fake-provider + ``asyncio.run`` style in ``test_ai_base_service.py``).
"""

import asyncio
from pathlib import Path

import pytest

from app.ai.prompts.prompt_manager import PromptManager
from app.ai.providers.base import AIProvider, GenerationResult
from app.ai.services.ai_base_service import AIBaseService


class _CapturingProvider(AIProvider):
    name = "fake"

    def __init__(self) -> None:
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
        return GenerationResult(content="ok", model=model or "m", provider=self.name)

    async def health_check(self) -> bool:  # pragma: no cover - unused
        return True


def _service(provider: AIProvider, tmp_path: Path) -> AIBaseService:
    # Passthrough template: rendered prompt == the "body" variable verbatim.
    (tmp_path / "echo.md").write_text("{{body}}")
    return AIBaseService(provider, PromptManager(prompts_dir=tmp_path))


def _run(provider: _CapturingProvider, tmp_path: Path, body: str, model: str) -> None:
    asyncio.run(
        _service(provider, tmp_path).run(
            prompt_name="echo", variables={"body": body}, model=model
        )
    )


def test_short_prompt_passes_through(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.core.config import settings

    monkeypatch.setattr(settings, "AI_MAX_PROMPT_CHARS", 1000)
    monkeypatch.setattr(settings, "AI_MODEL_MAX_PROMPT_CHARS", {})
    provider = _CapturingProvider()
    _run(provider, tmp_path, "hello world", model="gpt-4.1")
    assert provider.seen_prompt == "hello world"


def test_long_prompt_truncated_to_default_limit(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.core.config import settings

    monkeypatch.setattr(settings, "AI_MAX_PROMPT_CHARS", 100)
    monkeypatch.setattr(settings, "AI_MODEL_MAX_PROMPT_CHARS", {})
    provider = _CapturingProvider()
    _run(provider, tmp_path, "x" * 500, model="gpt-4.1")
    assert provider.seen_prompt is not None
    assert len(provider.seen_prompt) == 100
    assert provider.seen_prompt.endswith("... [truncated]")


def test_per_model_override_respected(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.core.config import settings

    monkeypatch.setattr(settings, "AI_MAX_PROMPT_CHARS", 100)
    monkeypatch.setattr(
        settings,
        "AI_MODEL_MAX_PROMPT_CHARS",
        {"big-model": 400, "small-model": 50},
    )
    body = "y" * 1000

    big = _CapturingProvider()
    _run(big, tmp_path, body, model="big-model")
    assert big.seen_prompt is not None
    assert len(big.seen_prompt) == 400

    small = _CapturingProvider()
    _run(small, tmp_path, body, model="small-model")
    assert small.seen_prompt is not None
    assert len(small.seen_prompt) == 50

