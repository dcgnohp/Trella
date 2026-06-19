from sqlmodel import Field

from app.core.base import TimestampMixin, UUIDMixin


class Workspace(UUIDMixin, TimestampMixin, table=True):
    __tablename__ = "workspaces"

    name: str = Field(max_length=255)
