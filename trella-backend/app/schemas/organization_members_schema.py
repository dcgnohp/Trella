import uuid
from datetime import datetime

from app.core.base import CamelModel


class OrganizationMemberPublic(CamelModel):
    id: uuid.UUID
    user_id: uuid.UUID
    org_id: uuid.UUID
    role: str
    created_at: datetime
    updated_at: datetime
