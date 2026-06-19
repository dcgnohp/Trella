import uuid

from sqlmodel import Session, select

from app.models.workspace_members_model import WorkspaceMember


class OrganizationMembersRepository:
    def create(self, session: Session, member: WorkspaceMember) -> WorkspaceMember:
        session.add(member)
        session.flush()
        return member

    def list_by_user(
        self, session: Session, user_id: uuid.UUID
    ) -> list[WorkspaceMember]:
        """Return all memberships belonging to the given user."""
        statement = select(WorkspaceMember).where(WorkspaceMember.user_id == user_id)
        return list(session.exec(statement).all())

    def get_by_user_and_org(
        self, session: Session, user_id: uuid.UUID, org_id: uuid.UUID
    ) -> WorkspaceMember | None:
        statement = select(WorkspaceMember).where(
            WorkspaceMember.user_id == user_id,
            WorkspaceMember.workspace_id == org_id,
        )
        return session.exec(statement).first()
