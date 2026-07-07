import uuid

from sqlalchemy import UniqueConstraint
from sqlmodel import Field

from app.core.base import TimestampMixin, UUIDMixin


class PlanBoard(UUIDMixin, TimestampMixin, table=True):
    __tablename__ = "plan_boards"
    __table_args__ = (
        UniqueConstraint("plan_id", "board_id", name="uq_plan_boards_plan_id_board_id"),
    )

    plan_id: uuid.UUID = Field(foreign_key="plans.id", ondelete="CASCADE")
    board_id: uuid.UUID = Field(foreign_key="boards.id", ondelete="CASCADE")
