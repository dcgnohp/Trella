import uuid

from fastapi import HTTPException, status
from sqlmodel import Session

from app.models.workspace_members_model import WorkspaceMember
from app.repositories.organization_members_repository import (
    OrganizationMembersRepository,
)


class OrganizationMemberService:
    """Business logic for organization memberships (org-scoping + ownership)."""

    def __init__(self, repo: OrganizationMembersRepository | None = None) -> None:
        self.repo = repo or OrganizationMembersRepository()

    def assert_member(
        self, session: Session, org_id: uuid.UUID, user_id: uuid.UUID
    ) -> WorkspaceMember:
        """Return the membership or raise HTTP 403 if user is not a member."""
        member = self.repo.get_by_user_and_org(session, user_id, org_id)
        if member is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not a member of this organization",
            )
        return member

    def add_owner(
        self, session: Session, org_id: uuid.UUID, user_id: uuid.UUID
    ) -> WorkspaceMember:
        """Create an OWNER membership linking user_id to org_id. Does not commit."""
        member = WorkspaceMember(
            user_id=user_id, workspace_id=org_id, role="OWNER", status="ACTIVE"
        )
        return self.repo.create(session, member)
