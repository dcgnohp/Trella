"""Indexing pipeline (Phase 9): document text -> chunks -> embeddings -> rows.

Composes the pure ``chunk_text`` step with a provider ``embed()`` call and the
``DocEmbeddingsRepository`` upsert. Provider-agnostic: the embedding provider
and model come entirely from config (``get_embedding_provider`` +
``AI_EMBEDDING_MODEL``); nothing here is vendor-specific.

Business isolation: this reads no business service — the caller passes the
document's fields. Only ids/text flow in; embeddings flow out to the repo.
"""

from __future__ import annotations

import uuid

from sqlmodel import Session

from app.ai.providers import AIProvider, get_embedding_provider
from app.ai.retrieval.chunking import chunk_text
from app.core.config import Settings
from app.core.config import settings as default_settings
from app.models.doc_embeddings_model import DocEmbedding
from app.repositories.doc_embeddings_repository import DocEmbeddingsRepository


class IndexingService:
    """Chunk + embed a document and (re)write its ``doc_embeddings`` rows."""

    def __init__(
        self,
        *,
        provider: AIProvider | None = None,
        repo: DocEmbeddingsRepository | None = None,
        settings: Settings | None = None,
    ) -> None:
        # Provider is resolved lazily from config so construction never forces
        # an embedding provider to exist (semantic search may be OFF).
        self._provider = provider
        self._repo = repo or DocEmbeddingsRepository()
        self._settings = settings or default_settings

    def _get_provider(self) -> AIProvider:
        if self._provider is None:
            self._provider = get_embedding_provider(self._settings)
        return self._provider

    async def index_doc(
        self,
        session: Session,
        *,
        doc_id: uuid.UUID,
        workspace_id: uuid.UUID,
        title: str,
        content: str | None,
    ) -> int:
        """(Re)index one document; returns the number of chunks stored.

        Embeds ``title`` + ``content`` together so a doc is findable by its
        title too. An empty document just clears any existing rows (returns 0).
        Caller-agnostic to whether the doc is new or updated. Commits the
        transaction.
        """
        text = f"{title}\n\n{content}".strip() if content else title.strip()
        chunks = (
            chunk_text(
                text,
                size=self._settings.AI_EMBEDDING_CHUNK_SIZE,
                overlap=self._settings.AI_EMBEDDING_CHUNK_OVERLAP,
            )
            if text
            else []
        )
        if not chunks:
            self._repo.replace_for_doc(session, doc_id, [])
            session.commit()
            return 0

        vectors = await self._get_provider().embed(
            chunks,
            model=self._settings.AI_EMBEDDING_MODEL,
            dimensions=self._settings.AI_EMBEDDING_DIM,
        )
        rows = [
            DocEmbedding(
                workspace_id=workspace_id,
                doc_id=doc_id,
                chunk_index=index,
                content_chunk=chunk,
                embedding=vector,
            )
            for index, (chunk, vector) in enumerate(zip(chunks, vectors, strict=True))
        ]
        self._repo.replace_for_doc(session, doc_id, rows)
        session.commit()
        return len(rows)

    def remove_doc(self, session: Session, *, doc_id: uuid.UUID) -> None:
        """Delete all embeddings for a document (e.g. on archive/delete)."""
        self._repo.delete_by_doc(session, doc_id)
        session.commit()
