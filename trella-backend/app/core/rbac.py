from enum import Enum
from uuid import UUID

from fastapi import HTTPException, status
from sqlmodel import Session

from app.models.enums import MemberStatus, ProjectRole, WorkspaceRole
from app.models.users_model import User

__all__ = [
    "RoleGroup",
    "Action",
    "PROJECT_ORDER",
    "WORKSPACE_ORDER",
    "PERMISSION_MATRIX",
    "RBACService",
]


class RoleGroup(str, Enum):
    PROJECT = "PROJECT"
    WORKSPACE = "WORKSPACE"


# Ordered HIGHEST → LOWEST authority within each group.
PROJECT_ORDER: list[ProjectRole] = [
    ProjectRole.PROJECT_ADMIN,
    ProjectRole.PROJECT_MEMBER,
    ProjectRole.PROJECT_VIEWER,
]
WORKSPACE_ORDER: list[WorkspaceRole] = [
    WorkspaceRole.OWNER,
    WorkspaceRole.ADMIN,
    WorkspaceRole.MANAGER,
    WorkspaceRole.MEMBER,
    WorkspaceRole.VIEWER,
]


class Action(str, Enum):
    VIEW_PROJECT_RESOURCE = "VIEW_PROJECT_RESOURCE"
    MANAGE_TASK = "MANAGE_TASK"  # Create / Update / Delete Task
    ASSIGN_TASK = "ASSIGN_TASK"  # set / unset assignee
    MANAGE_OWN_COMMENT = "MANAGE_OWN_COMMENT"
    MANAGE_OTHERS_COMMENT = "MANAGE_OTHERS_COMMENT"
    MANAGE_OWN_ATTACHMENT = "MANAGE_OWN_ATTACHMENT"
    DELETE_OTHERS_ATTACHMENT = "DELETE_OTHERS_ATTACHMENT"
    MANAGE_BOARD_COLUMN = "MANAGE_BOARD_COLUMN"
    MANAGE_PROJECT_MEMBER = "MANAGE_PROJECT_MEMBER"
    MANAGE_BOARD_MEMBER = "MANAGE_BOARD_MEMBER"
    MANAGE_WORKSPACE_MEMBER = "MANAGE_WORKSPACE_MEMBER"
    MANAGE_CUSTOM_STATUS = "MANAGE_CUSTOM_STATUS"  # CustomStatus + StatusMapping
    CHANGE_WORKSPACE_SETTINGS = "CHANGE_WORKSPACE_SETTINGS"


PERMISSION_MATRIX: dict[Action, tuple[RoleGroup, str]] = {
    Action.VIEW_PROJECT_RESOURCE: (RoleGroup.PROJECT, ProjectRole.PROJECT_VIEWER),
    Action.MANAGE_TASK: (RoleGroup.PROJECT, ProjectRole.PROJECT_MEMBER),
    Action.ASSIGN_TASK: (RoleGroup.PROJECT, ProjectRole.PROJECT_MEMBER),
    Action.MANAGE_OWN_COMMENT: (RoleGroup.PROJECT, ProjectRole.PROJECT_MEMBER),
    Action.MANAGE_OTHERS_COMMENT: (RoleGroup.PROJECT, ProjectRole.PROJECT_ADMIN),
    Action.MANAGE_OWN_ATTACHMENT: (RoleGroup.PROJECT, ProjectRole.PROJECT_MEMBER),
    Action.DELETE_OTHERS_ATTACHMENT: (
        RoleGroup.PROJECT,
        ProjectRole.PROJECT_ADMIN,
    ),
    Action.MANAGE_BOARD_COLUMN: (RoleGroup.PROJECT, ProjectRole.PROJECT_ADMIN),
    Action.MANAGE_PROJECT_MEMBER: (RoleGroup.PROJECT, ProjectRole.PROJECT_ADMIN),
    Action.MANAGE_BOARD_MEMBER: (RoleGroup.PROJECT, ProjectRole.PROJECT_ADMIN),
    Action.MANAGE_WORKSPACE_MEMBER: (RoleGroup.WORKSPACE, WorkspaceRole.ADMIN),
    Action.MANAGE_CUSTOM_STATUS: (RoleGroup.WORKSPACE, WorkspaceRole.ADMIN),
    Action.CHANGE_WORKSPACE_SETTINGS: (RoleGroup.WORKSPACE, WorkspaceRole.OWNER),
}


def _rank(order: list[ProjectRole] | list[WorkspaceRole], role: str | Enum) -> int:
    """Return the index of ``role`` within ``order`` (lower index = higher rank)."""
    needle = role.value if isinstance(role, Enum) else role
    return [member.value for member in order].index(needle)


class RBACService:
    def effective_project_role(
        self, session: Session, project_id: UUID, user_id: UUID
    ) -> ProjectRole | None:
        """Return the user's ProjectRole for ``project_id``, or ``None`` if not an active member."""
        from sqlmodel import select

        from app.models.project_members_model import ProjectMember

        statement = select(ProjectMember).where(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == user_id,
        )
        member = session.exec(statement).first()
        if member is None or member.status != MemberStatus.ACTIVE:
            return None
        return ProjectRole(member.project_role)

    def effective_workspace_role(
        self, session: Session, workspace_id: UUID, user_id: UUID
    ) -> WorkspaceRole | None:
        """Return the user's WorkspaceRole for ``workspace_id``, or ``None`` if not an active member."""
        from sqlmodel import select

        from app.models.workspace_members_model import WorkspaceMember

        statement = select(WorkspaceMember).where(
            WorkspaceMember.workspace_id == workspace_id,
            WorkspaceMember.user_id == user_id,
        )
        member = session.exec(statement).first()
        if member is None or member.status != MemberStatus.ACTIVE:
            return None
        return WorkspaceRole(member.role)

    def check(
        self,
        session: Session,
        action: Action,
        *,
        user: User,
        project_id: UUID | None = None,
        workspace_id: UUID | None = None,
    ) -> None:
        """Raise HTTP 403 if ``user`` is not permitted to perform ``action``."""
        group, min_role = PERMISSION_MATRIX[action]

        effective: ProjectRole | WorkspaceRole | None
        order: list[ProjectRole] | list[WorkspaceRole]
        if group is RoleGroup.PROJECT:
            order = PROJECT_ORDER
            effective = (
                self.effective_project_role(session, project_id, user.id)
                if project_id is not None
                else None
            )
        else:
            order = WORKSPACE_ORDER
            effective = (
                self.effective_workspace_role(session, workspace_id, user.id)
                if workspace_id is not None
                else None
            )

        # A larger _rank index means lower authority; effective is sufficient iff its rank <= min role's rank.
        if effective is None or _rank(order, effective) > _rank(order, min_role):
            min_required_role = (
                min_role.value if isinstance(min_role, Enum) else min_role
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    f"Permission denied: {action.value} requires {min_required_role}"
                ),
            )
