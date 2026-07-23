import uuid
from datetime import datetime
from typing import Literal

from pydantic import EmailStr, field_validator

from app.core.base import CamelModel
from app.models.enums import WorkspaceRole


class WorkspaceInvite(CamelModel):
    email: EmailStr
    role: str

    @field_validator("role")
    @classmethod
    def _validate_role(cls, value: str) -> str:
        valid = {member.value for member in WorkspaceRole}
        if value not in valid:
            allowed = ", ".join(member.value for member in WorkspaceRole)
            raise ValueError(f"role must be one of {allowed}")
        return value


class WorkspaceMemberUpdate(CamelModel):
    role: str | None = None
    status: str | None = None


class WorkspaceMemberPublic(CamelModel):
    id: uuid.UUID
    workspace_id: uuid.UUID
    user_id: uuid.UUID
    email: str
    full_name: str | None = None
    role: str
    status: str
    invited_by: uuid.UUID | None = None
    created_at: datetime
    updated_at: datetime


class InvitationPublic(CamelModel):
    membership_id: uuid.UUID
    scope: Literal["WORKSPACE", "PROJECT"]
    workspace_id: uuid.UUID | None = None
    project_id: uuid.UUID | None = None
    org_name: str
    role: str
    invited_by: uuid.UUID | None = None
    created_at: datetime
