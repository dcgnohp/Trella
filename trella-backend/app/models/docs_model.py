import uuid

from sqlalchemy import Text
from sqlmodel import Field

from app.core.base import TimestampMixin, UUIDMixin


class Doc(UUIDMixin, TimestampMixin, table=True):
    __tablename__ = "docs"  # type: ignore

    workspace_id: uuid.UUID = Field(foreign_key="workspaces.id", ondelete="CASCADE")
    parent_id: uuid.UUID | None = Field(
        default=None, foreign_key="docs.id", ondelete="SET NULL", nullable=True
    )
    # Linked task (optional — doc can be free-standing or task-linked)
    task_id: uuid.UUID | None = Field(
        default=None, foreign_key="tasks.id", ondelete="SET NULL", nullable=True
    )
    title: str = Field(max_length=500)
    content: str | None = Field(default=None, sa_type=Text, nullable=True)
    created_by: uuid.UUID = Field(foreign_key="users.id", ondelete="CASCADE")
    position: int = Field(default=0)
    is_archived: bool = Field(default=False)
    source_type: str = Field(default="MANUAL", max_length=50)
    category: str | None = Field(default=None, max_length=100, nullable=True)
    collection_id: uuid.UUID | None = Field(
        default=None,
        foreign_key="knowledge_collections.id",
        ondelete="SET NULL",
        nullable=True,
    )
    sprint_id: uuid.UUID | None = Field(
        default=None, foreign_key="sprints.id", ondelete="SET NULL", nullable=True
    )
    epic_id: uuid.UUID | None = Field(
        default=None, foreign_key="tasks.id", ondelete="SET NULL", nullable=True
    )
    board_id: uuid.UUID | None = Field(
        default=None, foreign_key="boards.id", ondelete="SET NULL", nullable=True
    )
    is_pinned_global: bool = Field(default=False)

    @property
    def author_name(self) -> str | None:
        return getattr(self, "_author_name", None)

    @author_name.setter
    def author_name(self, value: str | None) -> None:
        self._author_name = value

    @property
    def author_email(self) -> str | None:
        return getattr(self, "_author_email", None)

    @author_email.setter
    def author_email(self, value: str | None) -> None:
        self._author_email = value

    @property
    def linked_entity_label(self) -> str | None:
        return getattr(self, "_linked_entity_label", None)

    @linked_entity_label.setter
    def linked_entity_label(self, value: str | None) -> None:
        self._linked_entity_label = value

    @property
    def linked_entity_type(self) -> str | None:
        return getattr(self, "_linked_entity_type", None)

    @linked_entity_type.setter
    def linked_entity_type(self, value: str | None) -> None:
        self._linked_entity_type = value
