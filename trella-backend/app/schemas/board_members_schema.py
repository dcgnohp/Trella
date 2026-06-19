import uuid

from app.core.base import CamelModel


class BoardMemberAdd(CamelModel):
    user_id: uuid.UUID
    role: str  # BoardRole value


class BoardMemberRoleUpdate(CamelModel):
    role: str  # BoardRole value


class BoardMemberPublic(CamelModel):
    id: uuid.UUID
    user_id: uuid.UUID
    email: str
    full_name: str | None
    avatar_url: str | None = None
    role: str
    status: str
    invited_by: uuid.UUID | None = None
