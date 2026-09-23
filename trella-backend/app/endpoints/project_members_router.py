import uuid

from fastapi import APIRouter, Depends, Query, status

from app.core.deps import (
    CurrentUser,
    SessionDep,
    require_project_permission,
)
from app.core.rbac import Action
from app.models.project_members_model import ProjectMember
from app.models.users_model import User
from app.schemas.project_members_schema import (
    MemberAdd,
    MemberRoleUpdate,
    ProjectMemberPublic,
)
from app.schemas.shared import DELETED_USER_PLACEHOLDER
from app.services.project_members_service import ProjectMembersService

router = APIRouter(prefix="/projects/{project_id}/members", tags=["project-members"])

_service = ProjectMembersService()


def _to_public(session: SessionDep, member: ProjectMember) -> ProjectMemberPublic:
    """Enrich a raw ProjectMember with its user identity."""
    user = session.get(User, member.user_id)
    if user is None:
        return ProjectMemberPublic(
            id=member.id,
            user_id=member.user_id,
            email="",
            full_name=DELETED_USER_PLACEHOLDER,
            avatar_url=None,
            project_role=member.project_role,
            status=member.status,
        )
    return ProjectMemberPublic(
        id=member.id,
        user_id=member.user_id,
        email=user.email,
        full_name=user.full_name,
        avatar_url=None,
        project_role=member.project_role,
        status=member.status,
    )


@router.get(
    "/search",
    response_model=list[ProjectMemberPublic],
    dependencies=[Depends(require_project_permission(Action.VIEW_PROJECT_RESOURCE))],
)
def search_members(
    session: SessionDep,
    project_id: uuid.UUID,
    current_user: CurrentUser,
    q: str = Query(default="", description="Search query for name or email"),
) -> list[ProjectMemberPublic]:
    """Search ACTIVE project members by name or email (case-insensitive substring)."""
    members = _service.search_members(session, project_id, q, current_user)
    return [_to_public(session, member) for member in members]


@router.post(
    "",
    response_model=ProjectMemberPublic,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_project_permission(Action.MANAGE_PROJECT_MEMBER))],
)
def add_member(
    session: SessionDep,
    project_id: uuid.UUID,
    data: MemberAdd,
    current_user: CurrentUser,
) -> ProjectMemberPublic:
    member = _service.add_member(session, project_id, data, current_user)
    return _to_public(session, member)


@router.get(
    "",
    response_model=list[ProjectMemberPublic],
    dependencies=[Depends(require_project_permission(Action.VIEW_PROJECT_RESOURCE))],
)
def list_members(
    session: SessionDep,
    project_id: uuid.UUID,
    current_user: CurrentUser,
) -> list[ProjectMemberPublic]:
    members = _service.list_members(session, project_id, current_user)
    return [_to_public(session, member) for member in members]


@router.patch("/{user_id}", response_model=ProjectMemberPublic)
def change_role(
    session: SessionDep,
    project_id: uuid.UUID,
    user_id: uuid.UUID,
    data: MemberRoleUpdate,
    current_user: CurrentUser,
) -> ProjectMemberPublic:
    member = _service.change_role(session, project_id, user_id, data, current_user)
    return _to_public(session, member)


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_member(
    session: SessionDep,
    project_id: uuid.UUID,
    user_id: uuid.UUID,
    current_user: CurrentUser,
) -> None:
    _service.remove_member(session, project_id, user_id, current_user)


@router.post("/me/accept", response_model=ProjectMemberPublic)
def accept_invitation(
    session: SessionDep,
    project_id: uuid.UUID,
    current_user: CurrentUser,
) -> ProjectMemberPublic:
    """Accept the current user's own pending invitation.

    No require_project_permission guard — a PENDING member has no effective role
    yet, so the RBAC matrix would wrongly deny them before they can accept.
    """
    member = _service.accept_invitation(session, project_id, current_user)
    return _to_public(session, member)


@router.post("/me/decline", status_code=status.HTTP_200_OK)
def decline_invitation(
    session: SessionDep,
    project_id: uuid.UUID,
    current_user: CurrentUser,
) -> dict[str, bool]:
    """Decline the current user's own pending invitation.

    No require_project_permission guard — same rationale as accept_invitation.
    """
    _service.decline_invitation(session, project_id, current_user)
    return {"success": True}
