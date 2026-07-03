import uuid

from fastapi import APIRouter, Query, status
from sqlmodel import Session

from app.core.deps import CurrentUser, SessionDep
from app.models.organizations_model import Organization
from app.models.users_model import User
from app.models.workspace_members_model import WorkspaceMember
from app.repositories.workspace_members_repository import WorkspaceMembersRepository
from app.schemas.workspace_members_schema import (
    InvitationPublic,
    WorkspaceInvite,
    WorkspaceMemberPublic,
)
from app.services.organization_members_service import OrganizationMemberService
from app.services.workspace_members_service import WorkspaceMembersService

router = APIRouter(tags=["workspace_members"])

_service = WorkspaceMembersService()
_repo = WorkspaceMembersRepository()
_org_member_service = OrganizationMemberService()


def _to_public(session: Session, membership: WorkspaceMember) -> WorkspaceMemberPublic:
    """Build a WorkspaceMemberPublic, enriching with the user's email/full name."""
    user = session.get(User, membership.user_id)
    return WorkspaceMemberPublic(
        id=membership.id,
        workspace_id=membership.workspace_id,
        user_id=membership.user_id,
        email=user.email if user else "",
        full_name=user.full_name if user else None,
        role=membership.role,
        status=membership.status,
        invited_by=membership.invited_by,
        created_at=membership.created_at,
        updated_at=membership.updated_at,
    )


def _workspace_name(session: Session, workspace_id: uuid.UUID) -> str:
    """Return the display name of the workspace, or "" if not found."""
    workspace = session.get(Organization, workspace_id)
    return workspace.name if workspace is not None else ""


@router.post(
    "/workspaces/{workspace_id}/members",
    response_model=WorkspaceMemberPublic,
    status_code=status.HTTP_201_CREATED,
)
def invite_member(
    session: SessionDep,
    workspace_id: uuid.UUID,
    data: WorkspaceInvite,
    current_user: CurrentUser,
) -> WorkspaceMemberPublic:
    membership = _service.invite_member(session, workspace_id, data, current_user)
    return _to_public(session, membership)


@router.post(
    "/workspaces/{workspace_id}/members/me/accept",
    response_model=WorkspaceMemberPublic,
    status_code=status.HTTP_200_OK,
)
def accept_invitation(
    session: SessionDep,
    workspace_id: uuid.UUID,
    current_user: CurrentUser,
) -> WorkspaceMemberPublic:
    """Raise HTTP 409 if no pending invitation exists for the current user."""
    membership = _service.accept(session, workspace_id, current_user)
    return _to_public(session, membership)


@router.post(
    "/workspaces/{workspace_id}/members/me/decline",
    status_code=status.HTTP_200_OK,
)
def decline_invitation(
    session: SessionDep,
    workspace_id: uuid.UUID,
    current_user: CurrentUser,
) -> dict[str, bool]:
    """Raise HTTP 409 if no pending invitation exists for the current user."""
    _service.decline(session, workspace_id, current_user)
    return {"success": True}


@router.get("/me/invitations", response_model=list[InvitationPublic])
def list_invitations(
    session: SessionDep,
    current_user: CurrentUser,
    type: str = Query(default="all", pattern="^(workspace|project|all)$"),
) -> list[InvitationPublic]:
    memberships: list[WorkspaceMember] = _service.list_invitations(
        session, current_user, type
    )
    return [
        InvitationPublic(
            membership_id=membership.id,
            scope="WORKSPACE",
            workspace_id=membership.workspace_id,
            project_id=None,
            org_name=_workspace_name(session, membership.workspace_id),
            role=membership.role,
            invited_by=membership.invited_by,
            created_at=membership.created_at,
        )
        for membership in memberships
    ]


@router.get(
    "/workspaces/{workspace_id}/members",
    response_model=list[WorkspaceMemberPublic],
)
def list_members(
    session: SessionDep,
    workspace_id: uuid.UUID,
    current_user: CurrentUser,
) -> list[WorkspaceMemberPublic]:
    _org_member_service.assert_member(session, workspace_id, current_user.id)
    members = _repo.list_all(session, workspace_id)
    return [_to_public(session, m) for m in members]


@router.delete(
    "/workspaces/{workspace_id}/members/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def remove_member(
    session: SessionDep,
    workspace_id: uuid.UUID,
    user_id: uuid.UUID,
    current_user: CurrentUser,
) -> None:
    _service.remove_member(session, workspace_id, user_id, current_user)
