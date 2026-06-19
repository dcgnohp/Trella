import uuid

from sqlalchemy import UniqueConstraint
from sqlmodel import Field

from app.core.base import TimestampMixin, UUIDMixin
from app.models.enums import MemberStatus


class ProjectMember(UUIDMixin, TimestampMixin, table=True):
    __tablename__ = "project_members"
    __table_args__ = (
        UniqueConstraint(
            "project_id", "user_id", name="uq_project_members_project_id_user_id"
        ),
    )

    project_id: uuid.UUID = Field(foreign_key="projects.id", ondelete="CASCADE")
    user_id: uuid.UUID = Field(foreign_key="users.id")
    project_role: str = Field()  # ProjectRole value (PROJECT_ADMIN | ... | VIEWER)
    status: str = Field(default=MemberStatus.PENDING.value)  # MemberStatus value
