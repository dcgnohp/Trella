import uuid
from datetime import datetime

from app.core.base import CamelModel


class OrgLimitPublic(CamelModel):
    id: uuid.UUID
    org_id: uuid.UUID
    count: int
    created_at: datetime
    updated_at: datetime
