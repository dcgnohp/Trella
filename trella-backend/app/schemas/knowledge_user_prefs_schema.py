import uuid
from datetime import datetime

from pydantic import ConfigDict
from pydantic.alias_generators import to_camel
from sqlmodel import SQLModel


class _Base(SQLModel):
    model_config = ConfigDict(  # type: ignore[assignment]
        alias_generator=to_camel,
        populate_by_name=True,
    )


class KnowledgeUserPrefUpsert(_Base):
    doc_id: uuid.UUID
    is_pinned: bool = False
    is_favorite: bool = False


class KnowledgeUserPrefPublic(_Base):
    id: uuid.UUID
    workspace_id: uuid.UUID
    user_id: uuid.UUID
    doc_id: uuid.UUID
    is_pinned: bool
    is_favorite: bool
    last_viewed_at: datetime | None
    created_at: datetime
    updated_at: datetime
