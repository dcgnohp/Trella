import uuid
from datetime import datetime

from app.core.base import CamelModel
from app.schemas.shared import AuthorPublic


class AttachmentPublic(CamelModel):
    id: uuid.UUID
    task_id: uuid.UUID
    uploader_id: uuid.UUID
    file_name: str
    mime_type: str
    size_bytes: int
    created_at: datetime
    updated_at: datetime
    uploader: AuthorPublic
