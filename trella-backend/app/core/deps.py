from collections.abc import Callable
from typing import TYPE_CHECKING, Annotated, Any, NamedTuple
from uuid import UUID

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jwt.exceptions import InvalidTokenError
from sqlmodel import Session

from app.core import security
from app.core.config import settings
from app.core.db import get_db
from app.core.rbac import Action, RBACService
from app.models.enums import UserAccountStatus
from app.models.users_model import User

if TYPE_CHECKING:
    from app.models.organization_members_model import OrganizationMember

__all__ = [
    "get_db",
    "SessionDep",
    "TokenDep",
    "get_current_user",
    "CurrentUser",
    "get_current_org_member",
    "require_project_permission",
    "require_workspace_permission",
    "resolve_scope",
    "ResolvedScope",
]


SessionDep = Annotated[Session, Depends(get_db)]

reusable_oauth2 = OAuth2PasswordBearer(
    tokenUrl=f"{settings.API_V1_STR}/login/access-token"
)
TokenDep = Annotated[str, Depends(reusable_oauth2)]


def get_current_user(session: SessionDep, token: TokenDep) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = security.decode_token(token)
        subject = payload["sub"]
        user_id = UUID(str(subject))
    except (InvalidTokenError, KeyError, ValueError):
        raise credentials_exception

    user = session.get(User, user_id)
    if not user:
        raise credentials_exception
    if not user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")
    if user.status == UserAccountStatus.REMOVED.value:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account has been removed",
        )
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def get_current_org_member(
    org_id: UUID,
    current_user: CurrentUser,
    session: SessionDep,
) -> "OrganizationMember":
    from app.services.organization_members_service import (
        OrganizationMemberService,
    )

    member = OrganizationMemberService().assert_member(session, org_id, current_user.id)
    if member is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this organization",
        )
    return member


def require_project_permission(action: Action) -> Callable[..., User]:
    def _dep(
        project_id: UUID,
        current_user: CurrentUser,
        session: SessionDep,
    ) -> User:
        RBACService().check(session, action, user=current_user, project_id=project_id)
        return current_user

    return _dep


def require_workspace_permission(action: Action) -> Callable[..., User]:
    def _dep(
        workspace_id: UUID,
        current_user: CurrentUser,
        session: SessionDep,
    ) -> User:
        RBACService().check(
            session, action, user=current_user, workspace_id=workspace_id
        )
        return current_user

    return _dep


class ResolvedScope(NamedTuple):
    project_id: UUID | None
    workspace_id: UUID | None


def _resolve_project_id(session: Session, resource: Any) -> UUID | None:
    node = resource
    for _ in range(6):
        project_id: UUID | None = getattr(node, "project_id", None)
        if project_id is not None:
            return project_id

        if type(node).__name__ == "Project":
            project_pk: UUID | None = getattr(node, "id", None)
            return project_pk

        task_id = getattr(node, "task_id", None)
        if task_id is not None:
            from app.models.tasks_model import Task

            parent = session.get(Task, task_id)
            if parent is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Task not found",
                )
            node = parent
            continue

        board_id = getattr(node, "board_id", None)
        if board_id is not None:
            from app.models.boards_model import Board

            parent = session.get(Board, board_id)
            if parent is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Board not found",
                )
            node = parent
            continue

        break

    return None


def resolve_scope(session: Session, resource: Any) -> ResolvedScope:
    project_id = _resolve_project_id(session, resource)

    workspace_id = getattr(resource, "workspace_id", None)
    if workspace_id is None and project_id is not None:
        from app.models.projects_model import Project

        project = session.get(Project, project_id)
        if project is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Project not found",
            )
        workspace_id = project.workspace_id

    return ResolvedScope(project_id=project_id, workspace_id=workspace_id)
