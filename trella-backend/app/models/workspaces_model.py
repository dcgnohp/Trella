from sqlmodel import Field

from app.core.base import TimestampMixin, UUIDMixin
from app.models.enums import WorkspaceMode


class Workspace(UUIDMixin, TimestampMixin, table=True):
    __tablename__ = "workspaces"

    name: str = Field(max_length=255)
    mode: str = Field(default=WorkspaceMode.TRELLO, max_length=20)
