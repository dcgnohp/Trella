import uuid
from enum import Enum
from typing import Protocol, runtime_checkable

from fastapi import HTTPException, status
from sqlmodel import Session

from app.core.rbac import Action, RBACService
from app.models.enums import ActivityAction, MemberStatus, NotificationType, ProjectRole
from app.models.project_members_model import ProjectMember
from app.models.projects_model import Project
from app.models.users_model import User
from app.repositories.project_members_repository import ProjectMembersRepository
from app.repositories.projects_repository import ProjectsRepository
from app.repositories.workspace_members_repository import WorkspaceMembersRepository
from app.services.activity_logs_service import ActivityLogsService
from app.services.notifications_service import NotificationService


@runtime_checkable
class MemberAddData(Protocol):
    user_id: uuid.UUID
    project_role: str | ProjectRole


@runtime_checkable
class MemberRoleUpdateData(Protocol):
    project_role: str | ProjectRole


def _role_value(role: str | ProjectRole) -> str:
    """Return the stored ``VARCHAR`` value for a ProjectRole (enum or string)."""
    return role.value if isinstance(role, Enum) else role


class ProjectMembersService:
    def __init__(
        self,
        project_members_repo: ProjectMembersRepository | None = None,
        workspace_members_repo: WorkspaceMembersRepository | None = None,
        notification_service: NotificationService | None = None,
        activity_logs_service: ActivityLogsService | None = None,
        rbac_service: RBACService | None = None,
        projects_repo: ProjectsRepository | None = None,
    ) -> None:
        self.project_members_repo = project_members_repo or ProjectMembersRepository()
        self.workspace_members_repo = (
            workspace_members_repo or WorkspaceMembersRepository()
        )
        self.notification_service = notification_service or NotificationService()
        self.activity_logs_service = activity_logs_service or ActivityLogsService()
        self.rbac_service = rbac_service or RBACService()
        self.projects_repo = projects_repo or ProjectsRepository()

    def _resolve_project(self, session: Session, project_id: uuid.UUID) -> Project:
        """Return the Project for project_id or raise HTTP 404."""
        project = self.projects_repo.get(session, project_id)
        if project is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Project not found",
            )
        return project

    def add_member(
        self,
        session: Session,
        project_id: uuid.UUID,
        data: MemberAddData,
        actor: User,
    ) -> ProjectMember:
        """Invite a user to a project as a PENDING member.

        Requires MANAGE_PROJECT_MEMBER. The invitee must already be an ACTIVE
        WorkspaceMember of the project's workspace. Raises HTTP 409 if the user
        is already ACTIVE or has a PENDING invitation. Re-invites users with
        DECLINED or REMOVED status.
        """
        project = self._resolve_project(session, project_id)
        self.rbac_service.check(
            session,
            Action.MANAGE_PROJECT_MEMBER,
            user=actor,
            project_id=project_id,
        )

        # Invitee must be an ACTIVE workspace member before being added to a project.
        workspace_member = self.workspace_members_repo.get_active(
            session, project.workspace_id, data.user_id
        )
        if workspace_member is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "User must be an active workspace member before being "
                    "added to a project"
                ),
            )

        role_value = _role_value(data.project_role)

        # Check for duplicate membership.
        existing = self.project_members_repo.get(session, project_id, data.user_id)
        if existing is not None and existing.status == MemberStatus.ACTIVE.value:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="User is already a member of this project",
            )
        if existing is not None and existing.status == MemberStatus.PENDING.value:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="User already has a pending invitation to this project",
            )

        try:
            if existing is not None:
                # Re-invite a DECLINED or REMOVED member.
                existing.project_role = role_value
                existing.status = MemberStatus.PENDING.value
                member = self.project_members_repo.update(session, existing)
            else:
                member = self.project_members_repo.create(
                    session,
                    ProjectMember(
                        project_id=project_id,
                        user_id=data.user_id,
                        project_role=role_value,
                        status=MemberStatus.PENDING.value,
                    ),
                )
            self.activity_logs_service.record(
                session,
                workspace_id=project.workspace_id,
                project_id=project_id,
                actor=actor,
                action=ActivityAction.MEMBER_ADDED,
                new_value={
                    "user_id": str(data.user_id),
                    "project_role": role_value,
                    "status": MemberStatus.PENDING.value,
                },
            )
            session.commit()
        except Exception:
            session.rollback()
            raise
        session.refresh(member)

        # Emit notification after commit so it cannot roll back the invite.
        self.notification_service.emit(
            session,
            recipient_id=data.user_id,
            type=NotificationType.PROJECT_INVITATION,
            title="You have been invited to a project",
            metadata={
                "project_id": str(project_id),
                "workspace_id": str(project.workspace_id),
            },
        )
        session.commit()
        session.refresh(member)
        return member

    def change_role(
        self,
        session: Session,
        project_id: uuid.UUID,
        user_id: uuid.UUID,
        data: MemberRoleUpdateData,
        actor: User,
    ) -> ProjectMember:
        """Change a member's project_role. Requires MANAGE_PROJECT_MEMBER.
        Records a MEMBER_ROLE_CHANGED activity log. Raises HTTP 404 if not found.
        """
        project = self._resolve_project(session, project_id)
        self.rbac_service.check(
            session,
            Action.MANAGE_PROJECT_MEMBER,
            user=actor,
            project_id=project_id,
        )

        member = self.project_members_repo.get(session, project_id, user_id)
        if member is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Project member not found",
            )

        old_role = member.project_role
        new_role = _role_value(data.project_role)
        try:
            member.project_role = new_role
            member = self.project_members_repo.update(session, member)
            self.activity_logs_service.record(
                session,
                workspace_id=project.workspace_id,
                project_id=project_id,
                actor=actor,
                action=ActivityAction.MEMBER_ROLE_CHANGED,
                old_value={"user_id": str(user_id), "project_role": old_role},
                new_value={"user_id": str(user_id), "project_role": new_role},
            )
            session.commit()
        except Exception:
            session.rollback()
            raise
        session.refresh(member)
        return member

    def remove_member(
        self,
        session: Session,
        project_id: uuid.UUID,
        user_id: uuid.UUID,
        actor: User,
    ) -> None:
        """Soft-remove a member by setting status to REMOVED. Requires MANAGE_PROJECT_MEMBER.
        Raises HTTP 404 if not found.
        """
        project = self._resolve_project(session, project_id)
        self.rbac_service.check(
            session,
            Action.MANAGE_PROJECT_MEMBER,
            user=actor,
            project_id=project_id,
        )

        member = self.project_members_repo.get(session, project_id, user_id)
        if member is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Project member not found",
            )

        old_status = member.status
        try:
            self.project_members_repo.set_status(session, member, MemberStatus.REMOVED)
            self.activity_logs_service.record(
                session,
                workspace_id=project.workspace_id,
                project_id=project_id,
                actor=actor,
                action=ActivityAction.MEMBER_REMOVED,
                old_value={"user_id": str(user_id), "status": old_status},
                new_value={
                    "user_id": str(user_id),
                    "status": MemberStatus.REMOVED.value,
                },
            )
            session.commit()
        except Exception:
            session.rollback()
            raise
        return None

    def list_members(
        self,
        session: Session,
        project_id: uuid.UUID,
        user: User,
    ) -> list[ProjectMember]:
        """List PENDING and ACTIVE members. Requires VIEW_PROJECT_RESOURCE."""
        self._resolve_project(session, project_id)
        self.rbac_service.check(
            session,
            Action.VIEW_PROJECT_RESOURCE,
            user=user,
            project_id=project_id,
        )
        return self.project_members_repo.list_visible(session, project_id)

    def search_members(
        self,
        session: Session,
        project_id: uuid.UUID,
        query: str,
        user: User,
    ) -> list[ProjectMember]:
        """Return ACTIVE members matching name/email query. Requires VIEW_PROJECT_RESOURCE."""
        self._resolve_project(session, project_id)
        self.rbac_service.check(
            session,
            Action.VIEW_PROJECT_RESOURCE,
            user=user,
            project_id=project_id,
        )
        return self.project_members_repo.search_active(session, project_id, query)

    def accept_invitation(
        self,
        session: Session,
        project_id: uuid.UUID,
        user: User,
    ) -> ProjectMember:
        """Transition the current user's PENDING membership to ACTIVE.

        No RBAC check — this is the invitee's own action. Raises HTTP 409 if no
        pending invitation exists.
        """
        project = self._resolve_project(session, project_id)
        member = self.project_members_repo.get(session, project_id, user.id)
        if member is None or member.status != MemberStatus.PENDING.value:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="No pending invitation found",
            )

        try:
            self.project_members_repo.set_status(session, member, MemberStatus.ACTIVE)
            self.activity_logs_service.record(
                session,
                workspace_id=project.workspace_id,
                project_id=project_id,
                actor=user,
                action=ActivityAction.MEMBER_ADDED,
                new_value={
                    "user_id": str(user.id),
                    "status": MemberStatus.ACTIVE.value,
                },
            )
            session.commit()
        except Exception:
            session.rollback()
            raise
        session.refresh(member)
        return member

    def decline_invitation(
        self,
        session: Session,
        project_id: uuid.UUID,
        user: User,
    ) -> None:
        """Transition the current user's PENDING membership to DECLINED.

        No RBAC check — this is the invitee's own action. Raises HTTP 409 if no
        pending invitation exists.
        """
        self._resolve_project(session, project_id)
        member = self.project_members_repo.get(session, project_id, user.id)
        if member is None or member.status != MemberStatus.PENDING.value:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="No pending invitation found",
            )

        try:
            self.project_members_repo.set_status(session, member, MemberStatus.DECLINED)
            session.commit()
        except Exception:
            session.rollback()
            raise
        return None
