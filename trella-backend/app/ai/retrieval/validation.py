"""Startup validation for the embedding setup (Phase 9, fail-fast).

The vector dimension is provider/model METADATA, not a hardcoded constant. When
semantic search is enabled we verify three numbers agree and refuse to boot
otherwise (so a mismatched model can never silently write wrong-sized vectors):

  1. the configured embedding provider + model are set;
  2. the live ``doc_embeddings.embedding`` column width (DB);
  3. the dimension the provider actually returns for a probe embedding.

All three must equal ``AI_EMBEDDING_DIM``.
"""

from __future__ import annotations

import logging

from sqlmodel import Session, text

from app.ai.providers import AIProvider, get_embedding_provider
from app.core.config import Settings
from app.core.config import settings as default_settings

logger = logging.getLogger("app.ai")


class EmbeddingConfigError(RuntimeError):
    """Raised at startup when the embedding provider/model/DB dims disagree."""


def _db_vector_dim(session: Session) -> int | None:
    """Return the ``doc_embeddings.embedding`` column dimension, or None.

    Uses pgvector's ``atttypmod`` (which stores the declared vector width).
    None means the table/column is absent (migration not applied yet).
    """
    row = session.exec(  # type: ignore[call-overload]
        text(
            "SELECT atttypmod FROM pg_attribute "
            "WHERE attrelid = to_regclass('doc_embeddings') "
            "AND attname = 'embedding' AND NOT attisdropped"
        )
    ).first()
    if row is None:
        return None
    dim = row[0]
    return int(dim) if dim is not None and dim > 0 else None


async def validate_embedding_setup(
    session: Session,
    *,
    settings: Settings | None = None,
    provider: AIProvider | None = None,
) -> None:
    """Fail fast unless provider model, DB column, and probe dims all match.

    No-op when ``AI_SEMANTIC_SEARCH_ENABLED`` is off, so default/test envs are
    unaffected. Raises :class:`EmbeddingConfigError` on any mismatch.
    """
    cfg = settings or default_settings
    if not cfg.AI_SEMANTIC_SEARCH_ENABLED:
        return

    if cfg.AI_EMBEDDING_PROVIDER is None or not cfg.AI_EMBEDDING_MODEL:
        raise EmbeddingConfigError(
            "AI_SEMANTIC_SEARCH_ENABLED is on but AI_EMBEDDING_PROVIDER / "
            "AI_EMBEDDING_MODEL are not configured."
        )

    expected = cfg.AI_EMBEDDING_DIM

    db_dim = _db_vector_dim(session)
    if db_dim is None:
        raise EmbeddingConfigError(
            "doc_embeddings.embedding column is missing — run the Phase 9 "
            "migration before enabling semantic search."
        )
    if db_dim != expected:
        raise EmbeddingConfigError(
            f"doc_embeddings.embedding dimension {db_dim} != AI_EMBEDDING_DIM "
            f"{expected}. Add a migration to alter the column, or fix the config."
        )

    prov = provider or get_embedding_provider(cfg)
    try:
        vectors = await prov.embed(
            ["dimension probe"], model=cfg.AI_EMBEDDING_MODEL, dimensions=expected
        )
    except Exception as exc:  # noqa: BLE001
        # ponytail: a PROVIDER error (denied key/403, quota/429, network) is NOT
        # a config bug — it must not brick startup. Log + skip the probe; the
        # dimension config (DB vs AI_EMBEDDING_DIM) was already fail-fast-checked
        # above. Semantic search will surface the provider error per-request
        # until the key/provider is reachable. Ceiling: the probe (provider dim
        # == config dim) is deferred to first real use in this degraded case.
        logger.warning(
            "Embedding probe skipped at startup: provider embed() failed (%s). "
            "Semantic search will error per-request until the provider is "
            "reachable; startup continues.",
            exc,
        )
        return
    actual = len(vectors[0]) if vectors else 0
    if actual != expected:
        raise EmbeddingConfigError(
            f"Embedding model {cfg.AI_EMBEDDING_MODEL!r} returned dimension "
            f"{actual} != AI_EMBEDDING_DIM {expected}. Set AI_EMBEDDING_DIM to "
            f"the model's dimension (and migrate the column to match)."
        )
