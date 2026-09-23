import uuid
from typing import Protocol

from fastapi import HTTPException, status
from sqlmodel import Session

from app.core.rbac import Action, RBACService
from app.models.enums import MemberStatus, NotificationType, WorkspaceRole
from app.models.users_model import User
from app.models.workspace_members_model import WorkspaceMember
from app.repositories.users_repository import UsersRepository
from app.repositories.workspace_members_repository import WorkspaceMembersRepository
from app.services.notifications_service import NotificationService


class WorkspaceInviteData(Protocol):
    """Structural type for the invite payload (email + role)."""

    email: str
    role: str


_NO_PENDING_INVITATION_DETAIL = "No pending invitation found"


class WorkspaceMembersService:
    """Business logic for workspace invitations (invite + accept/decline + list)."""

    def __init__(
        self,
        repo: WorkspaceMembersRepository | None = None,
        users_repo: UsersRepository | None = None,
        notification_service: NotificationService | None = None,
        rbac_service: RBACService | None = None,
    ) -> None:
        self.repo = repo or WorkspaceMembersRepository()
        self.users_repo = users_repo or UsersRepository()
        self.notification_service = notification_service or NotificationService()
        self.rbac_service = rbac_service or RBACService()

    def invite_member(
        self,
        session: Session,
        workspace_id: uuid.UUID,
        data: WorkspaceInviteData,
        actor: User,
    ) -> WorkspaceMember:
        """Invite the user identified by data.email to workspace_id.

        Raises HTTP 403 if actor lacks ADMIN/OWNER role, HTTP 404 if the invitee
        email is unknown, HTTP 409 if the user is already active or has a pending
        invitation. Emits a WORKSPACE_INVITATION notification after commit.
        """
        self.rbac_service.check(
            session,
            Action.MANAGE_WORKSPACE_MEMBER,
            user=actor,
            workspace_id=workspace_id,
        )

        invitee = self.users_repo.get_by_email(session, data.email)
        if invitee is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User account not found",
            )

        existing = self.repo.get(session, workspace_id, invitee.id)
        if existing is not None and existing.status == MemberStatus.ACTIVE.value:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="User is already a member of this workspace",
            )
        if existing is not None and existing.status == MemberStatus.PENDING.value:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="User already has a pending invitation to this workspace",
            )

        role_value = (
            data.role.value if isinstance(data.role, WorkspaceRole) else data.role
        )

        if existing is not None:
            # Reuse the stale DECLINED/REMOVED row to preserve the UNIQUE(workspace_id, user_id) constraint.
            existing.role = role_value
            existing.status = MemberStatus.PENDING.value
            existing.invited_by = actor.id
            membership = self.repo.update(session, existing)
        else:
            membership = self.repo.create(
                session,
                WorkspaceMember(
                    workspace_id=workspace_id,
                    user_id=invitee.id,
                    role=role_value,
                    status=MemberStatus.PENDING.value,
                    invited_by=actor.id,
                ),
            )

        session.commit()
        session.refresh(membership)

        self.notification_service.emit(
            session,
            recipient_id=invitee.id,
            type=NotificationType.WORKSPACE_INVITATION,
            title="You have been invited to a workspace",
            metadata={
                "workspace_id": str(workspace_id),
                "membership_id": str(membership.id),
                "invited_by": str(actor.id),
            },
        )
        session.commit()
        session.refresh(membership)

        return membership

    def accept(
        self, session: Session, workspace_id: uuid.UUID, user: User
    ) -> WorkspaceMember:
        """Accept user's PENDING invitation to workspace_id.

        Raises HTTP 409 if there is no pending invitation.
        """
        membership = self._require_pending(session, workspace_id, user)
        membership = self.repo.set_status(session, membership, MemberStatus.ACTIVE)
        session.commit()
        session.refresh(membership)
        return membership

    def decline(self, session: Session, workspace_id: uuid.UUID, user: User) -> None:
        """Decline user's PENDING invitation to workspace_id.

        Raises HTTP 409 if there is no pending invitation.
        """
        membership = self._require_pending(session, workspace_id, user)
        self.repo.set_status(session, membership, MemberStatus.DECLINED)
        session.commit()

    def remove_member(
        self,
        session: Session,
        workspace_id: uuid.UUID,
        target_user_id: uuid.UUID,
        actor: User,
    ) -> None:
        """Remove target_user_id from workspace_id.

        Raises HTTP 403 if actor lacks ADMIN/OWNER, HTTP 404 if membership not found,
        HTTP 409 if actor tries to remove themselves.
        """
        self.rbac_service.check(
            session,
            Action.MANAGE_WORKSPACE_MEMBER,
            user=actor,
            workspace_id=workspace_id,
        )
        if target_user_id == actor.id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="You cannot remove yourself from the workspace",
            )
        membership = self.repo.get(session, workspace_id, target_user_id)
        if membership is None or membership.status == MemberStatus.REMOVED.value:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Membership not found",
            )
        self.repo.set_status(session, membership, MemberStatus.REMOVED)
        session.commit()

    def update_member(
        self,
        session: Session,
        workspace_id: uuid.UUID,
        target_user_id: uuid.UUID,
        role: str | None,
        status_val: str | None,
        actor: User,
    ) -> WorkspaceMember:
        """Update role or status for target_user_id in workspace_id."""
        self.rbac_service.check(
            session,
            Action.MANAGE_WORKSPACE_MEMBER,
            user=actor,
            workspace_id=workspace_id,
        )
        membership = self.repo.get(session, workspace_id, target_user_id)
        if membership is None or membership.status == MemberStatus.REMOVED.value:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Membership not found",
            )
        if role is not None:
            membership.role = role
        if status_val is not None:
            membership.status = status_val
        updated = self.repo.update(session, membership)
        session.commit()
        session.refresh(updated)
        return updated

    def list_invitations(
        self, session: Session, user: User, type: str = "all"
    ) -> list[WorkspaceMember]:
        """Return user's outstanding PENDING workspace invitations."""
        if type == "project":
            return []
        return self.repo.list_pending_for_user(session, user.id)

    def _require_pending(
        self, session: Session, workspace_id: uuid.UUID, user: User
    ) -> WorkspaceMember:
        """Return user's PENDING membership or raise HTTP 409."""
        membership = self.repo.get(session, workspace_id, user.id)
        if membership is None or membership.status != MemberStatus.PENDING.value:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=_NO_PENDING_INVITATION_DETAIL,
            )
        return membership
