import uuid

from fastapi import HTTPException, status
from sqlmodel import Session

from app.models.org_limits_model import OrgLimit
from app.models.org_subscriptions_model import OrgSubscription
from app.models.organizations_model import Organization
from app.models.users_model import User
from app.repositories.org_limits_repository import OrgLimitsRepository
from app.repositories.org_subscriptions_repository import OrgSubscriptionsRepository
from app.repositories.organizations_repository import OrganizationsRepository
from app.schemas.organizations_schema import OrganizationCreate
from app.services.organization_members_service import OrganizationMemberService


class OrganizationsService:
    """Business logic for the ``organizations`` domain."""

    def __init__(
        self,
        organizations_repo: OrganizationsRepository | None = None,
        member_service: OrganizationMemberService | None = None,
        org_limits_repo: OrgLimitsRepository | None = None,
        org_subscriptions_repo: OrgSubscriptionsRepository | None = None,
    ) -> None:
        self.organizations_repo = organizations_repo or OrganizationsRepository()
        self.member_service = member_service or OrganizationMemberService()
        self.org_limits_repo = org_limits_repo or OrgLimitsRepository()
        self.org_subscriptions_repo = (
            org_subscriptions_repo or OrgSubscriptionsRepository()
        )

    def create_org(
        self, session: Session, data: OrganizationCreate, user: User
    ) -> Organization:
        """Create an organization and bootstrap companion rows atomically."""
        try:
            org = self.organizations_repo.create(session, Organization(name=data.name))
            self.member_service.add_owner(session, org.id, user.id)
            self.org_limits_repo.create(session, OrgLimit(org_id=org.id, count=0))
            self.org_subscriptions_repo.create(session, OrgSubscription(org_id=org.id))

            # Create Default Custom Statuses
            from app.models.custom_statuses_model import CustomStatus
            from app.models.enums import CanonicalStatus

            default_statuses = [
                ("To Do", "#6b7280", CanonicalStatus.TODO.value),
                ("In Progress", "#3b82f6", CanonicalStatus.IN_PROGRESS.value),
                ("Pending", "#f59e0b", CanonicalStatus.PENDING.value),
                ("Done", "#10b981", CanonicalStatus.DONE.value),
            ]
            for name, color, canonical in default_statuses:
                session.add(
                    CustomStatus(
                        workspace_id=org.id,
                        name=name,
                        color=color,
                        canonical_status=canonical,
                    )
                )

            # Create Default Project and bootstrap creator as PROJECT_ADMIN
            from app.models.enums import MemberStatus, ProjectRole
            from app.models.project_members_model import ProjectMember
            from app.models.projects_model import Project
            from app.repositories.project_members_repository import (
                ProjectMembersRepository,
            )
            from app.repositories.projects_repository import ProjectsRepository

            projects_repo = ProjectsRepository()
            project_members_repo = ProjectMembersRepository()

            project = projects_repo.create(
                session,
                Project(
                    workspace_id=org.id,
                    name="Default Project",
                    key="DEFAULT",
                    description=None,
                    created_by=user.id,
                ),
            )
            project_members_repo.create(
                session,
                ProjectMember(
                    project_id=project.id,
                    user_id=user.id,
                    project_role=ProjectRole.PROJECT_ADMIN.value,
                    status=MemberStatus.ACTIVE.value,
                ),
            )

            session.commit()
        except Exception:
            session.rollback()
            raise
        session.refresh(org)
        return org

    def list_for_user(self, session: Session, user_id: uuid.UUID) -> list[Organization]:
        """Return every organization the given user is a member of."""
        memberships = self.member_service.repo.list_by_user(session, user_id)
        org_ids = [m.workspace_id for m in memberships]
        return self.organizations_repo.list_by_ids(session, org_ids)

    def get_for_member(
        self, session: Session, org_id: uuid.UUID, user_id: uuid.UUID
    ) -> Organization:
        """Raise HTTP 403 if user is not a member; raise HTTP 404 if org is missing."""
        self.member_service.assert_member(session, org_id, user_id)
        org = self.organizations_repo.get(session, org_id)
        if org is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Organization not found",
            )
        return org

    def delete_org(self, session: Session, org_id: uuid.UUID, user: User) -> None:
        """Delete an organization. Only allowed for OWNER role."""
        member = self.member_service.assert_member(session, org_id, user.id)
        if member.role != "OWNER":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only the workspace owner can delete the workspace",
            )
        org = self.organizations_repo.get(session, org_id)
        if org is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Organization not found",
            )
        try:
            self.organizations_repo.delete(session, org)
            session.commit()
        except Exception:
            session.rollback()
            raise
