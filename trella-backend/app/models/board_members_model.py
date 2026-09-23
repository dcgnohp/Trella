import uuid

from sqlalchemy import UniqueConstraint
from sqlmodel import Field

from app.core.base import TimestampMixin, UUIDMixin
from app.models.enums import MemberStatus


class BoardMember(UUIDMixin, TimestampMixin, table=True):
    __tablename__ = "board_members"
    __table_args__ = (
        UniqueConstraint(
            "board_id", "user_id", name="uq_board_members_board_id_user_id"
        ),
    )

    board_id: uuid.UUID = Field(foreign_key="boards.id", ondelete="CASCADE")
    user_id: uuid.UUID = Field(foreign_key="users.id")
    role: str = Field()  # BoardRole value (BOARD_ADMIN | BOARD_MEMBER | BOARD_VIEWER)
    status: str = Field(default=MemberStatus.PENDING.value)  # MemberStatus value
    invited_by: uuid.UUID | None = Field(default=None, foreign_key="users.id")
