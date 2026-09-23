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


class KnowledgeCollectionCreate(_Base):
    name: str
    description: str | None = None
    icon: str | None = None
    color: str | None = None
    position: int = 0


class KnowledgeCollectionUpdate(_Base):
    name: str | None = None
    description: str | None = None
    icon: str | None = None
    color: str | None = None
    position: int | None = None


class KnowledgeCollectionPublic(_Base):
    id: uuid.UUID
    workspace_id: uuid.UUID
    name: str
    description: str | None
    icon: str | None
    color: str | None
    created_by: uuid.UUID
    position: int
    created_at: datetime
    updated_at: datetime
