import uuid

from sqlmodel import Field

from app.core.base import TimestampMixin, UUIDMixin


class OrgLimit(UUIDMixin, TimestampMixin, table=True):
    __tablename__ = "org_limits"

    org_id: uuid.UUID = Field(foreign_key="workspaces.id", ondelete="CASCADE")
    count: int = Field(default=0)
