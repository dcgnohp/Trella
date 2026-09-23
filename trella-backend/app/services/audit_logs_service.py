import uuid

from fastapi import HTTPException, status
from sqlmodel import Session

from app.models.audit_logs_model import AuditAction, AuditLog, EntityType
from app.models.users_model import User
from app.repositories.audit_logs_repository import AuditLogsRepository
from app.repositories.boards_repository import BoardsRepository
from app.repositories.projects_repository import ProjectsRepository
from app.services.organization_members_service import OrganizationMemberService


class AuditLogsService:
    """Business logic for the audit_logs domain (record + scoped queries)."""

    def __init__(
        self,
        repo: AuditLogsRepository | None = None,
        member_service: OrganizationMemberService | None = None,
        boards_repo: BoardsRepository | None = None,
        projects_repo: ProjectsRepository | None = None,
    ) -> None:
        self.repo = repo or AuditLogsRepository()
        self.member_service = member_service or OrganizationMemberService()
        self.boards_repo = boards_repo or BoardsRepository()
        self.projects_repo = projects_repo or ProjectsRepository()

    def record(
        self,
        session: Session,
        action: AuditAction | str,
        entity_type: EntityType | str,
        entity_id: uuid.UUID,
        entity_title: str,
        user: User,
        *,
        org_id: uuid.UUID,
    ) -> AuditLog:
        """Stage an audit row in the caller's session without committing."""
        action_value = action.value if isinstance(action, AuditAction) else action
        entity_type_value = (
            entity_type.value if isinstance(entity_type, EntityType) else entity_type
        )
        audit_log = AuditLog(
            org_id=org_id,
            user_id=user.id,
            action=action_value,
            entity_type=entity_type_value,
            entity_id=entity_id,
            entity_title=entity_title,
            user_name=user.full_name or user.email,
            user_image=None,  # User has no image column in Phase 1.
        )
        return self.repo.create(session, audit_log)

    def list_for_org(
        self,
        session: Session,
        org_id: uuid.UUID,
        current_user: User,
        *,
        skip: int = 0,
        limit: int = 100,
    ) -> list[AuditLog]:
        """Raise HTTP 403 if user is not a member, then return the org's audit log newest first."""
        self.member_service.assert_member(session, org_id, current_user.id)
        return self.repo.list_by_org(session, org_id, skip=skip, limit=limit)

    def list_for_board(
        self,
        session: Session,
        board_id: uuid.UUID,
        current_user: User,
    ) -> list[AuditLog]:
        """Raise HTTP 404 if board is missing, HTTP 403 if not a member, then return board audit logs."""
        board = self.boards_repo.get(session, board_id)
        if board is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Board not found",
            )
        project = self.projects_repo.get(session, board.project_id)
        if project is None:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Owning project for board not found",
            )
        self.member_service.assert_member(
            session, project.workspace_id, current_user.id
        )
        entity_ids: list[uuid.UUID] = [board_id]
        return self.repo.list_by_entities(session, entity_ids)

    def list_for_card(
        self,
        session: Session,
        card_id: uuid.UUID,
        current_user: User,
    ) -> list[AuditLog]:
        """Return audit logs for a card; raises HTTP 403 if user is not a member of the owning org."""
        logs = self.repo.list_by_card(session, card_id)
        if not logs:
            return []
        self.member_service.assert_member(session, logs[0].org_id, current_user.id)
        return logs
