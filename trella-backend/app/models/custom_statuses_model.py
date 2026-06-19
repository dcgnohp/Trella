import uuid

from sqlalchemy import UniqueConstraint
from sqlmodel import Field

from app.core.base import TimestampMixin, UUIDMixin


class CustomStatus(UUIDMixin, TimestampMixin, table=True):
    __tablename__ = "custom_statuses"
    __table_args__ = (
        UniqueConstraint(
            "workspace_id",
            "name",
            name="uq_custom_statuses_workspace_id_name",
        ),
    )

    workspace_id: uuid.UUID = Field(foreign_key="workspaces.id", ondelete="CASCADE")
    name: str = Field(max_length=50)
    color: str | None = Field(default=None, max_length=7, nullable=True)
    # CanonicalStatus value (TODO|IN_PROGRESS|PENDING|DONE) or NULL when unmapped.
    canonical_status: str | None = Field(default=None, nullable=True)
