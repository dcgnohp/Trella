import uuid

from sqlmodel import Field, SQLModel


class VelocityConfig(SQLModel, table=True):
    __tablename__ = "velocity_configs"  # type: ignore
    __table_args__ = {"extend_existing": True}

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    workspace_id: uuid.UUID = Field(
        foreign_key="workspaces.id",
        unique=True,
        ondelete="CASCADE",
        nullable=False,
    )
    hours_per_point: float = Field(default=4.0)
