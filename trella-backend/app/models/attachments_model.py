import uuid

from sqlmodel import Field

from app.core.base import TimestampMixin, UUIDMixin


class Attachment(UUIDMixin, TimestampMixin, table=True):
    __tablename__ = "attachments"

    task_id: uuid.UUID = Field(foreign_key="tasks.id", ondelete="CASCADE")
    uploader_id: uuid.UUID = Field(foreign_key="users.id")
    file_name: str = Field(max_length=255)
    mime_type: str = Field(max_length=255)
    size_bytes: int = Field()
    # Internal only — never serialized to clients; downloads use a signed URL.
    storage_key: str = Field(max_length=512)
