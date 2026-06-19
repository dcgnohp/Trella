import uuid

from sqlmodel import Session, select

from app.models.enums import MemberStatus
from app.models.users_model import User
from app.models.workspace_members_model import WorkspaceMember


class WorkspaceMembersRepository:
    def create(self, session: Session, member: WorkspaceMember) -> WorkspaceMember:
        session.add(member)
        session.flush()
        return member

    def get(
        self, session: Session, workspace_id: uuid.UUID, user_id: uuid.UUID
    ) -> WorkspaceMember | None:
        """Return the membership for (workspace_id, user_id) or None regardless of status."""
        statement = select(WorkspaceMember).where(
            WorkspaceMember.workspace_id == workspace_id,
            WorkspaceMember.user_id == user_id,
        )
        return session.exec(statement).first()

    def get_active(
        self, session: Session, workspace_id: uuid.UUID, user_id: uuid.UUID
    ) -> WorkspaceMember | None:
        """Return the ACTIVE membership for (workspace_id, user_id) or None."""
        statement = select(WorkspaceMember).where(
            WorkspaceMember.workspace_id == workspace_id,
            WorkspaceMember.user_id == user_id,
            WorkspaceMember.status == MemberStatus.ACTIVE.value,
        )
        return session.exec(statement).first()

    def get_by_email(
        self, session: Session, workspace_id: uuid.UUID, email: str
    ) -> WorkspaceMember | None:
        """Return the membership in workspace_id for the user with email, or None."""
        statement = (
            select(WorkspaceMember)
            .join(User, WorkspaceMember.user_id == User.id)  # type: ignore[arg-type]
            .where(
                WorkspaceMember.workspace_id == workspace_id,
                User.email == email,
            )
        )
        return session.exec(statement).first()

    def list_pending_for_user(
        self, session: Session, user_id: uuid.UUID
    ) -> list[WorkspaceMember]:
        """Return all PENDING workspace memberships for the user."""
        statement = select(WorkspaceMember).where(
            WorkspaceMember.user_id == user_id,
            WorkspaceMember.status == MemberStatus.PENDING.value,
        )
        return list(session.exec(statement).all())

    def list_active(
        self, session: Session, workspace_id: uuid.UUID
    ) -> list[WorkspaceMember]:
        """Return all ACTIVE members of a workspace."""
        statement = select(WorkspaceMember).where(
            WorkspaceMember.workspace_id == workspace_id,
            WorkspaceMember.status == MemberStatus.ACTIVE.value,
        )
        return list(session.exec(statement).all())

    def update(self, session: Session, member: WorkspaceMember) -> WorkspaceMember:
        session.add(member)
        session.flush()
        return member

    def set_status(
        self, session: Session, member: WorkspaceMember, status: MemberStatus
    ) -> WorkspaceMember:
        member.status = status.value
        session.add(member)
        session.flush()
        return member
