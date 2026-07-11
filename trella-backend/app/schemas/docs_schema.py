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


class DocCreate(_Base):
    title: str
    content: str | None = None
    parent_id: uuid.UUID | None = None
    task_id: uuid.UUID | None = None
    position: int = 0
    source_type: str = "MANUAL"
    category: str | None = None
    collection_id: uuid.UUID | None = None
    sprint_id: uuid.UUID | None = None
    epic_id: uuid.UUID | None = None
    board_id: uuid.UUID | None = None
    is_pinned_global: bool = False


class DocUpdate(_Base):
    title: str | None = None
    content: str | None = None
    parent_id: uuid.UUID | None = None
    task_id: uuid.UUID | None = None
    position: int | None = None
    is_archived: bool | None = None
    source_type: str | None = None
    category: str | None = None
    collection_id: uuid.UUID | None = None
    sprint_id: uuid.UUID | None = None
    epic_id: uuid.UUID | None = None
    board_id: uuid.UUID | None = None
    is_pinned_global: bool | None = None


class DocPublic(_Base):
    id: uuid.UUID
    workspace_id: uuid.UUID
    parent_id: uuid.UUID | None
    task_id: uuid.UUID | None
    title: str
    content: str | None
    created_by: uuid.UUID
    position: int
    is_archived: bool
    created_at: datetime
    updated_at: datetime
    source_type: str
    category: str | None
    collection_id: uuid.UUID | None
    sprint_id: uuid.UUID | None
    epic_id: uuid.UUID | None
    board_id: uuid.UUID | None
    is_pinned_global: bool
    author_name: str | None = None
    author_email: str | None = None
    linked_entity_label: str | None = None
    linked_entity_type: str | None = None
