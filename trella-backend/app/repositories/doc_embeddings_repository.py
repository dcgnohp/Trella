"""Repository for ``doc_embeddings`` (Phase 9, Semantic Search).

Owns the raw persistence of embedded document chunks and the cosine
nearest-neighbour query. No business logic, no AI calls -- the Indexing service
and the semantic-search tool sit above it.
"""

from __future__ import annotations

import uuid

from sqlmodel import Session, delete, select

from app.models.doc_embeddings_model import DocEmbedding


class DocEmbeddingsRepository:
    def delete_by_doc(self, session: Session, doc_id: uuid.UUID) -> None:
        """Remove all embedding rows for a document."""
        stmt = delete(DocEmbedding).where(DocEmbedding.doc_id == doc_id)  # type: ignore[arg-type]
        session.exec(stmt)

    def replace_for_doc(
        self, session: Session, doc_id: uuid.UUID, rows: list[DocEmbedding]
    ) -> None:
        """Atomically swap a document's chunks: delete old rows, add ``rows``.

        Caller owns the transaction boundary (commit/rollback).
        """
        self.delete_by_doc(session, doc_id)
        for row in rows:
            session.add(row)

    def search_by_workspace(
        self,
        session: Session,
        workspace_id: uuid.UUID,
        query_embedding: list[float],
        top_k: int,
    ) -> list[tuple[DocEmbedding, float]]:
        """Return the ``top_k`` nearest chunks in a workspace by cosine distance.

        Returns ``(chunk, distance)`` pairs; smaller distance = more similar.
        Scoped to ``workspace_id`` so results never cross workspaces.
        """
        distance = DocEmbedding.embedding.cosine_distance(query_embedding)  # type: ignore[attr-defined]
        stmt = (
            select(DocEmbedding, distance.label("distance"))
            .where(DocEmbedding.workspace_id == workspace_id)
            .order_by(distance)
            .limit(top_k)
        )
        result = session.exec(stmt).all()
        return [(row[0], float(row[1])) for row in result]
