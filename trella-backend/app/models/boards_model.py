import uuid

from sqlmodel import Field

from app.core.base import TimestampMixin, UUIDMixin


class Board(UUIDMixin, TimestampMixin, table=True):
    __tablename__ = "boards"

    project_id: uuid.UUID = Field(foreign_key="projects.id", ondelete="CASCADE")
    title: str = Field(max_length=255)
    image_id: str | None = Field(default=None)
    image_thumb_url: str | None = Field(default=None)
    image_full_url: str | None = Field(default=None)
    image_user_name: str | None = Field(default=None)
    image_link_html: str | None = Field(default=None)
