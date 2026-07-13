"""B5 check: context builder base contract + credential redaction."""

import asyncio

from app.ai.context.base import ContextBuilder


class _StubContext(ContextBuilder):
    def build(self) -> dict[str, str]:
        return {"title": "Ship it"}


def test_concrete_builder_builds() -> None:
    assert _StubContext().build() == {"title": "Ship it"}


def test_retrieve_is_noop_by_default() -> None:
    assert asyncio.run(_StubContext().retrieve("anything")) == []


def test_redact_drops_credential_keys_recursively() -> None:
    dirty = {
        "title": "Task",
        "api_key": "sk-123",
        "nested": {"password": "p", "note": "keep"},
        "items": [{"token": "t", "ok": "yes"}],
    }
    clean = ContextBuilder.redact(dirty)
    assert clean == {
        "title": "Task",
        "nested": {"note": "keep"},
        "items": [{"ok": "yes"}],
    }
