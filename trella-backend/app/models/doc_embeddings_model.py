import uuid

from pgvector.sqlalchemy import Vector
from sqlalchemy import Text
from sqlmodel import Column, Field

from app.core.base import TimestampMixin, UUIDMixin
from app.core.config import settings


class DocEmbedding(UUIDMixin, TimestampMixin, table=True):
    """One embedded chunk of a workspace document (Phase 9, Semantic Search).

    A doc is chunked and each chunk stored as a row with its ``embedding``
    vector. Semantic search embeds the query and finds nearest chunks by cosine
    distance, scoped to a workspace. The vector width comes from
    ``settings.AI_EMBEDDING_DIM`` (provider/model metadata, validated at
    startup against the provider AND the live DB column).
    """

    __tablename__ = "doc_embeddings"

    # CASCADE so deleting a workspace/doc removes its embeddings.
    workspace_id: uuid.UUID = Field(
        foreign_key="workspaces.id", ondelete="CASCADE", index=True
    )
    doc_id: uuid.UUID = Field(foreign_key="docs.id", ondelete="CASCADE", index=True)
    chunk_index: int = Field()
    content_chunk: str = Field(sa_type=Text)
    embedding: list[float] = Field(
        sa_column=Column(Vector(settings.AI_EMBEDDING_DIM), nullable=False)
    )
