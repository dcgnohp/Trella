"""Phase 9 startup embedding-dimension validation (fail-fast)."""

from __future__ import annotations

import asyncio
from types import SimpleNamespace
from typing import Any, cast

import pytest

from app.ai.retrieval.validation import EmbeddingConfigError, validate_embedding_setup


class _FakeProvider:
    def __init__(self, dim: int) -> None:
        self._dim = dim
        self.calls = 0

    async def embed(
        self,
        texts: list[str],
        *,
        model: str | None = None,
        dimensions: int | None = None,
        timeout: float | None = None,
    ) -> list[list[float]]:
        self.calls += 1
        return [[0.0] * self._dim for _ in texts]


def _session(db_dim: int | None) -> Any:
    row = None if db_dim is None else (db_dim,)
    return SimpleNamespace(exec=lambda _stmt: SimpleNamespace(first=lambda: row))


def _settings(
    *,
    enabled: bool = True,
    provider: str | None = "gemini",
    model: str | None = "emb",
    dim: int = 768,
) -> Any:
    return SimpleNamespace(
        AI_SEMANTIC_SEARCH_ENABLED=enabled,
        AI_EMBEDDING_PROVIDER=provider,
        AI_EMBEDDING_MODEL=model,
        AI_EMBEDDING_DIM=dim,
    )


def _run(session: Any, settings: Any, provider: Any) -> None:
    asyncio.run(
        validate_embedding_setup(
            cast(Any, session),
            settings=cast(Any, settings),
            provider=cast(Any, provider),
        )
    )


def test_noop_when_disabled() -> None:
    prov = _FakeProvider(768)
    _run(_session(768), _settings(enabled=False), prov)
    assert prov.calls == 0  # never probes when semantic search is off


def test_raises_when_provider_or_model_unset() -> None:
    with pytest.raises(EmbeddingConfigError):
        _run(_session(768), _settings(provider=None), _FakeProvider(768))
    with pytest.raises(EmbeddingConfigError):
        _run(_session(768), _settings(model=None), _FakeProvider(768))


def test_raises_when_db_column_missing() -> None:
    with pytest.raises(EmbeddingConfigError):
        _run(_session(None), _settings(dim=768), _FakeProvider(768))


def test_raises_on_db_dim_mismatch() -> None:
    with pytest.raises(EmbeddingConfigError):
        _run(_session(1536), _settings(dim=768), _FakeProvider(768))


def test_raises_on_provider_dim_mismatch() -> None:
    with pytest.raises(EmbeddingConfigError):
        _run(_session(768), _settings(dim=768), _FakeProvider(384))


def test_passes_when_all_dims_match() -> None:
    prov = _FakeProvider(768)
    _run(_session(768), _settings(dim=768), prov)
    assert prov.calls == 1
