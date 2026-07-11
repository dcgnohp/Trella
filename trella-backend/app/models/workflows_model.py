import uuid
from sqlmodel import Field
from app.core.base import TimestampMixin, UUIDMixin


class Workflow(UUIDMixin, TimestampMixin, table=True):
    __tablename__ = "workflows"

    workspace_id: uuid.UUID = Field(foreign_key="workspaces.id", ondelete="CASCADE")
    name: str = Field(max_length=100)
    description: str | None = Field(default=None, max_length=500, nullable=True)
    is_active: bool = Field(default=True, nullable=False)


class WorkflowTransition(UUIDMixin, TimestampMixin, table=True):
    __tablename__ = "workflow_transitions"

    workflow_id: uuid.UUID = Field(foreign_key="workflows.id", ondelete="CASCADE")
    name: str = Field(max_length=100)  # E.g., "Start Progress", "Resolve Issue"
    from_status_id: uuid.UUID | None = Field(
        default=None,
        foreign_key="custom_statuses.id",
        ondelete="CASCADE",
        nullable=True,
    )  # Null indicates transition can start from ANY status
    to_status_id: uuid.UUID = Field(
        foreign_key="custom_statuses.id",
        ondelete="CASCADE",
        nullable=False,
    )

    # JSON strings storing arrays of configurations
    conditions: str = Field(default="[]")  # E.g., '[{"type": "ASSIGNEE_ONLY"}]'
    validators: str = Field(default="[]")  # E.g., '[{"type": "COMMENT_REQUIRED"}]'
    actions: str = Field(default="[]")     # E.g., '[{"type": "AUTO_ASSIGN_TO_ACTOR"}]'
