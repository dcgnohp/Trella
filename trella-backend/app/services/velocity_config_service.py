import uuid

from fastapi import HTTPException, status
from sqlmodel import Session, select

from app.core.rbac import Action, RBACService
from app.models.users_model import User
from app.models.velocity_config_model import VelocityConfig
from app.models.workspace_members_model import WorkspaceMember
from app.models.enums import MemberStatus
from app.repositories.velocity_config_repository import VelocityConfigRepository


class VelocityConfigService:
    def __init__(
        self,
        repo: VelocityConfigRepository | None = None,
        rbac_service: RBACService | None = None,
    ) -> None:
        self.repo = repo or VelocityConfigRepository()
        self.rbac_service = rbac_service or RBACService()

    def _assert_workspace_member(
        self, session: Session, workspace_id: uuid.UUID, user_id: uuid.UUID
    ) -> None:
        """Raise HTTP 403 if user is not an active workspace member."""
        statement = select(WorkspaceMember).where(
            WorkspaceMember.workspace_id == workspace_id,
            WorkspaceMember.user_id == user_id,
            WorkspaceMember.status == MemberStatus.ACTIVE.value,
        )
        member = session.exec(statement).first()
        if member is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Permission denied: must be an active workspace member",
            )

    def get_or_create(
        self, session: Session, workspace_id: uuid.UUID, user: User
    ) -> VelocityConfig:
        """Return the velocity config for a workspace, creating a default if absent.
        Requires active workspace membership.
        """
        self._assert_workspace_member(session, workspace_id, user.id)
        try:
            config = self.repo.get_or_create_default(session, workspace_id)
            session.commit()
        except Exception:
            session.rollback()
            raise
        session.refresh(config)
        return config

    def update(
        self,
        session: Session,
        workspace_id: uuid.UUID,
        hours_per_point: float,
        user: User,
    ) -> VelocityConfig:
        """Update hours_per_point for a workspace's velocity config.
        Requires MANAGE_CUSTOM_STATUS (workspace ADMIN or higher).
        """
        self.rbac_service.check(
            session,
            Action.MANAGE_CUSTOM_STATUS,
            user=user,
            workspace_id=workspace_id,
        )
        if hours_per_point <= 0:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="hours_per_point must be greater than 0",
            )
        try:
            config = self.repo.get_or_create_default(session, workspace_id)
            config.hours_per_point = hours_per_point
            config = self.repo.update(session, config)
            session.commit()
        except Exception:
            session.rollback()
            raise
        session.refresh(config)
        return config
