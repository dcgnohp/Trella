import uuid

from sqlalchemy import func
from sqlmodel import Session, col, select

from app.models.enums import MemberStatus
from app.models.project_members_model import ProjectMember
from app.models.users_model import User


class ProjectMembersRepository:
    def create(self, session: Session, member: ProjectMember) -> ProjectMember:
        session.add(member)
        session.flush()
        return member

    def get(
        self, session: Session, project_id: uuid.UUID, user_id: uuid.UUID
    ) -> ProjectMember | None:
        statement = select(ProjectMember).where(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == user_id,
        )
        return session.exec(statement).first()

    def get_active(
        self, session: Session, project_id: uuid.UUID, user_id: uuid.UUID
    ) -> ProjectMember | None:
        """Return the ACTIVE membership or None."""
        statement = select(ProjectMember).where(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == user_id,
            ProjectMember.status == MemberStatus.ACTIVE.value,
        )
        return session.exec(statement).first()

    def list_visible(
        self, session: Session, project_id: uuid.UUID
    ) -> list[ProjectMember]:
        """Return PENDING and ACTIVE members for a project."""
        statement = (
            select(ProjectMember)
            .where(
                ProjectMember.project_id == project_id,
                col(ProjectMember.status).in_(
                    [MemberStatus.PENDING.value, MemberStatus.ACTIVE.value]
                ),
            )
            .order_by(col(ProjectMember.created_at))
        )
        return list(session.exec(statement).all())

    def list_pending_for_user(
        self, session: Session, user_id: uuid.UUID
    ) -> list[ProjectMember]:
        """Return all PENDING project invitations for the given user."""
        statement = (
            select(ProjectMember)
            .where(
                ProjectMember.user_id == user_id,
                ProjectMember.status == MemberStatus.PENDING.value,
            )
            .order_by(col(ProjectMember.created_at))
        )
        return list(session.exec(statement).all())

    def update(self, session: Session, member: ProjectMember) -> ProjectMember:
        session.add(member)
        session.flush()
        return member

    def set_status(
        self, session: Session, member: ProjectMember, status: MemberStatus
    ) -> ProjectMember:
        member.status = status.value
        session.add(member)
        session.flush()
        return member

    def get_active_by_name(
        self, session: Session, project_id: uuid.UUID, name: str
    ) -> User | None:
        """Return the User whose full_name matches ``name`` (case-insensitive) and is an ACTIVE project member."""
        statement = (
            select(User)
            .join(ProjectMember, ProjectMember.user_id == User.id)
            .where(
                ProjectMember.project_id == project_id,
                ProjectMember.status == MemberStatus.ACTIVE.value,
                func.lower(User.full_name) == name.lower(),
            )
        )
        return session.exec(statement).first()

    def search_active(
        self, session: Session, project_id: uuid.UUID, query: str
    ) -> list[ProjectMember]:
        """Return ACTIVE members whose user name or email contains ``query`` (case-insensitive)."""
        from sqlalchemy import or_

        q = f"%{query.lower()}%"
        statement = (
            select(ProjectMember)
            .join(User, User.id == ProjectMember.user_id)
            .where(
                ProjectMember.project_id == project_id,
                ProjectMember.status == MemberStatus.ACTIVE.value,
                or_(
                    func.lower(User.full_name).like(q),
                    func.lower(User.email).like(q),
                ),
            )
            .order_by(col(ProjectMember.created_at))
        )
        return list(session.exec(statement).all())
