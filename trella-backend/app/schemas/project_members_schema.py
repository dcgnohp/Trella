import uuid

from app.core.base import CamelModel


class MemberAdd(CamelModel):
    user_id: uuid.UUID
    project_role: str  # ProjectRole value


class MemberRoleUpdate(CamelModel):
    project_role: str  # ProjectRole value


class ProjectMemberPublic(CamelModel):
    id: uuid.UUID
    user_id: uuid.UUID
    email: str
    full_name: str | None
    avatar_url: str | None = None
    project_role: str
    status: str
