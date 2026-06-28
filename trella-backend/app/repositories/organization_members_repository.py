import uuid

from sqlmodel import Session, select

from app.models.enums import MemberStatus
from app.models.workspace_members_model import WorkspaceMember


class OrganizationMembersRepository:
    def create(self, session: Session, member: WorkspaceMember) -> WorkspaceMember:
        session.add(member)
        session.flush()
        return member

    def list_by_user(
        self, session: Session, user_id: uuid.UUID
    ) -> list[WorkspaceMember]:
        """Return the user's ACTIVE memberships (PENDING/DECLINED are excluded)."""
        statement = select(WorkspaceMember).where(
            WorkspaceMember.user_id == user_id,
            WorkspaceMember.status == MemberStatus.ACTIVE.value,
        )
        return list(session.exec(statement).all())

    def get_by_user_and_org(
        self, session: Session, user_id: uuid.UUID, org_id: uuid.UUID
    ) -> WorkspaceMember | None:
        """Return the user's ACTIVE membership in org_id, or None.

        PENDING/DECLINED memberships are treated as non-members so an invitee
        cannot access the workspace before accepting.
        """
        statement = select(WorkspaceMember).where(
            WorkspaceMember.user_id == user_id,
            WorkspaceMember.workspace_id == org_id,
            WorkspaceMember.status == MemberStatus.ACTIVE.value,
        )
        return session.exec(statement).first()
