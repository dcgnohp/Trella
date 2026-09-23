import uuid

from sqlmodel import Session, col, select

from app.models.board_members_model import BoardMember
from app.models.enums import MemberStatus


class BoardMembersRepository:
    def create(self, session: Session, member: BoardMember) -> BoardMember:
        session.add(member)
        session.flush()
        return member

    def get(
        self, session: Session, board_id: uuid.UUID, user_id: uuid.UUID
    ) -> BoardMember | None:
        statement = select(BoardMember).where(
            BoardMember.board_id == board_id,
            BoardMember.user_id == user_id,
        )
        return session.exec(statement).first()

    def get_active(
        self, session: Session, board_id: uuid.UUID, user_id: uuid.UUID
    ) -> BoardMember | None:
        statement = select(BoardMember).where(
            BoardMember.board_id == board_id,
            BoardMember.user_id == user_id,
            BoardMember.status == MemberStatus.ACTIVE.value,
        )
        return session.exec(statement).first()

    def list_visible(self, session: Session, board_id: uuid.UUID) -> list[BoardMember]:
        statement = (
            select(BoardMember)
            .where(
                BoardMember.board_id == board_id,
                col(BoardMember.status).in_(
                    [MemberStatus.PENDING.value, MemberStatus.ACTIVE.value]
                ),
            )
            .order_by(col(BoardMember.created_at))
        )
        return list(session.exec(statement).all())

    def list_pending_for_user(
        self, session: Session, user_id: uuid.UUID
    ) -> list[BoardMember]:
        statement = (
            select(BoardMember)
            .where(
                BoardMember.user_id == user_id,
                BoardMember.status == MemberStatus.PENDING.value,
            )
            .order_by(col(BoardMember.created_at))
        )
        return list(session.exec(statement).all())

    def update(self, session: Session, member: BoardMember) -> BoardMember:
        session.add(member)
        session.flush()
        return member

    def set_status(
        self, session: Session, member: BoardMember, status: MemberStatus
    ) -> BoardMember:
        member.status = status.value
        session.add(member)
        session.flush()
        return member
