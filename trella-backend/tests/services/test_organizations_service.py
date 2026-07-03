import uuid
import pytest
from fastapi import HTTPException
from sqlmodel import Session, select

from app.models.organizations_model import Organization
from app.models.users_model import User
from app.models.enums import UserAccountStatus, MemberStatus
from app.models.workspace_members_model import WorkspaceMember
from app.models.custom_statuses_model import CustomStatus
from app.models.projects_model import Project
from app.services.organizations_service import OrganizationsService
from app.services.organization_members_service import OrganizationMemberService


def _user(session: Session, email: str) -> User:
    user = User(
        email=email,
        full_name="Test User",
        hashed_password="xxx",
        status=UserAccountStatus.ACTIVE.value,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def test_delete_organization_cascade_and_roles(session: Session) -> None:
    service = OrganizationsService()
    member_service = OrganizationMemberService()

    # 1. Create two users
    owner = _user(session, "owner@example.com")
    non_owner = _user(session, "nonowner@example.com")

    # 2. Create organization (owner creates it)
    from app.schemas.organizations_schema import OrganizationCreate

    org = service.create_org(session, OrganizationCreate(name="My Org"), owner)

    # Confirm default custom statuses are seeded
    statuses = session.exec(
        select(CustomStatus).where(CustomStatus.workspace_id == org.id)
    ).all()
    assert len(statuses) == 4

    # Confirm default project is seeded
    projects = session.exec(select(Project).where(Project.workspace_id == org.id)).all()
    assert len(projects) == 1
    project = projects[0]

    # Add non_owner as a member (not OWNER)
    member_service.repo.create(
        session,
        WorkspaceMember(
            workspace_id=org.id,
            user_id=non_owner.id,
            role="MEMBER",
            status=MemberStatus.ACTIVE.value,
        ),
    )
    session.commit()

    # 3. Non-owner tries to delete (should fail with 403)
    with pytest.raises(HTTPException) as exc:
        service.delete_org(session, org.id, non_owner)
    assert exc.value.status_code == 403
    assert exc.value.detail == "Only the workspace owner can delete the workspace"

    # 4. Owner deletes the organization (should succeed)
    service.delete_org(session, org.id, owner)

    # Confirm organization is deleted
    deleted_org = session.get(Organization, org.id)
    assert deleted_org is None

    # Confirm memberships are deleted (cascade)
    memberships = session.exec(
        select(WorkspaceMember).where(WorkspaceMember.workspace_id == org.id)
    ).all()
    assert len(memberships) == 0

    # Confirm projects are deleted (cascade)
    projs = session.exec(select(Project).where(Project.workspace_id == org.id)).all()
    assert len(projs) == 0

    # Confirm custom statuses are deleted (cascade)
    cs = session.exec(
        select(CustomStatus).where(CustomStatus.workspace_id == org.id)
    ).all()
    assert len(cs) == 0
