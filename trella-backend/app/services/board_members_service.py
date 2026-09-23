import uuid
from enum import Enum

from fastapi import HTTPException, status
from sqlmodel import Session

from app.core.rbac import Action, RBACService
from app.models.board_members_model import BoardMember
from app.models.boards_model import Board
from app.models.enums import ActivityAction, BoardRole, MemberStatus, NotificationType
from app.models.projects_model import Project
from app.models.users_model import User
from app.repositories.board_members_repository import BoardMembersRepository
from app.repositories.boards_repository import BoardsRepository
from app.repositories.projects_repository import ProjectsRepository
from app.repositories.workspace_members_repository import WorkspaceMembersRepository
from app.services.activity_logs_service import ActivityLogsService
from app.services.notifications_service import NotificationService


def _role_value(role: str | BoardRole) -> str:
    return role.value if isinstance(role, Enum) else role


class BoardMembersService:
    def __init__(
        self,
        board_members_repo: BoardMembersRepository | None = None,
        workspace_members_repo: WorkspaceMembersRepository | None = None,
        boards_repo: BoardsRepository | None = None,
        projects_repo: ProjectsRepository | None = None,
        notification_service: NotificationService | None = None,
        activity_logs_service: ActivityLogsService | None = None,
        rbac_service: RBACService | None = None,
    ) -> None:
        self.board_members_repo = board_members_repo or BoardMembersRepository()
        self.workspace_members_repo = (
            workspace_members_repo or WorkspaceMembersRepository()
        )
        self.boards_repo = boards_repo or BoardsRepository()
        self.projects_repo = projects_repo or ProjectsRepository()
        self.notification_service = notification_service or NotificationService()
        self.activity_logs_service = activity_logs_service or ActivityLogsService()
        self.rbac_service = rbac_service or RBACService()

    def _resolve_board(self, session: Session, board_id: uuid.UUID) -> Board:
        board = self.boards_repo.get(session, board_id)
        if board is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Board not found"
            )
        return board

    def _resolve_project(self, session: Session, project_id: uuid.UUID) -> Project:
        project = self.projects_repo.get(session, project_id)
        if project is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Project not found"
            )
        return project

    def add_member(
        self,
        session: Session,
        board_id: uuid.UUID,
        user_id: uuid.UUID,
        role: str | BoardRole,
        actor: User,
    ) -> BoardMember:
        board = self._resolve_board(session, board_id)
        project = self._resolve_project(session, board.project_id)

        self.rbac_service.check(
            session,
            Action.MANAGE_BOARD_MEMBER,
            user=actor,
            project_id=board.project_id,
        )

        workspace_member = self.workspace_members_repo.get_active(
            session, project.workspace_id, user_id
        )
        if workspace_member is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User must be an active workspace member before being added to a board",
            )

        role_value = _role_value(role)
        existing = self.board_members_repo.get(session, board_id, user_id)
        if existing is not None and existing.status == MemberStatus.ACTIVE.value:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="User is already a member of this board",
            )
        if existing is not None and existing.status == MemberStatus.PENDING.value:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="User already has a pending invitation to this board",
            )

        try:
            if existing is not None:
                existing.role = role_value
                existing.status = MemberStatus.PENDING.value
                existing.invited_by = actor.id
                member = self.board_members_repo.update(session, existing)
            else:
                member = self.board_members_repo.create(
                    session,
                    BoardMember(
                        board_id=board_id,
                        user_id=user_id,
                        role=role_value,
                        status=MemberStatus.PENDING.value,
                        invited_by=actor.id,
                    ),
                )
            self.activity_logs_service.record(
                session,
                workspace_id=project.workspace_id,
                project_id=board.project_id,
                actor=actor,
                action=ActivityAction.MEMBER_ADDED,
                new_value={
                    "user_id": str(user_id),
                    "board_id": str(board_id),
                    "role": role_value,
                    "scope": "board",
                },
            )
            session.commit()
        except Exception:
            session.rollback()
            raise
        session.refresh(member)

        self.notification_service.emit(
            session,
            recipient_id=user_id,
            type=NotificationType.BOARD_INVITATION,
            title="You have been invited to a board",
            metadata={
                "board_id": str(board_id),
                "project_id": str(board.project_id),
                "workspace_id": str(project.workspace_id),
            },
        )
        session.commit()
        session.refresh(member)
        return member

    def change_role(
        self,
        session: Session,
        board_id: uuid.UUID,
        user_id: uuid.UUID,
        role: str | BoardRole,
        actor: User,
    ) -> BoardMember:
        board = self._resolve_board(session, board_id)
        project = self._resolve_project(session, board.project_id)

        self.rbac_service.check(
            session,
            Action.MANAGE_BOARD_MEMBER,
            user=actor,
            project_id=board.project_id,
        )

        member = self.board_members_repo.get(session, board_id, user_id)
        if member is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Board member not found"
            )

        old_role = member.role
        new_role = _role_value(role)
        try:
            member.role = new_role
            member = self.board_members_repo.update(session, member)
            self.activity_logs_service.record(
                session,
                workspace_id=project.workspace_id,
                project_id=board.project_id,
                actor=actor,
                action=ActivityAction.MEMBER_ROLE_CHANGED,
                old_value={"user_id": str(user_id), "role": old_role, "scope": "board"},
                new_value={"user_id": str(user_id), "role": new_role, "scope": "board"},
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
        board_id: uuid.UUID,
        user_id: uuid.UUID,
        actor: User,
    ) -> None:
        board = self._resolve_board(session, board_id)
        project = self._resolve_project(session, board.project_id)

        self.rbac_service.check(
            session,
            Action.MANAGE_BOARD_MEMBER,
            user=actor,
            project_id=board.project_id,
        )

        member = self.board_members_repo.get(session, board_id, user_id)
        if member is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Board member not found"
            )

        old_status = member.status
        try:
            self.board_members_repo.set_status(session, member, MemberStatus.REMOVED)
            self.activity_logs_service.record(
                session,
                workspace_id=project.workspace_id,
                project_id=board.project_id,
                actor=actor,
                action=ActivityAction.MEMBER_REMOVED,
                old_value={
                    "user_id": str(user_id),
                    "status": old_status,
                    "scope": "board",
                },
                new_value={
                    "user_id": str(user_id),
                    "status": MemberStatus.REMOVED.value,
                    "scope": "board",
                },
            )
            session.commit()
        except Exception:
            session.rollback()
            raise

    def list_members(
        self,
        session: Session,
        board_id: uuid.UUID,
        user: User,
    ) -> list[BoardMember]:
        board = self._resolve_board(session, board_id)
        self.rbac_service.check(
            session,
            Action.VIEW_PROJECT_RESOURCE,
            user=user,
            project_id=board.project_id,
        )
        return self.board_members_repo.list_visible(session, board_id)

    def accept_invitation(
        self,
        session: Session,
        board_id: uuid.UUID,
        user: User,
    ) -> BoardMember:
        board = self._resolve_board(session, board_id)
        project = self._resolve_project(session, board.project_id)

        member = self.board_members_repo.get(session, board_id, user.id)
        if member is None or member.status != MemberStatus.PENDING.value:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="No pending invitation found",
            )

        try:
            self.board_members_repo.set_status(session, member, MemberStatus.ACTIVE)
            self.activity_logs_service.record(
                session,
                workspace_id=project.workspace_id,
                project_id=board.project_id,
                actor=user,
                action=ActivityAction.MEMBER_ADDED,
                new_value={
                    "user_id": str(user.id),
                    "board_id": str(board_id),
                    "status": MemberStatus.ACTIVE.value,
                    "scope": "board",
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
        board_id: uuid.UUID,
        user: User,
    ) -> None:
        self._resolve_board(session, board_id)
        member = self.board_members_repo.get(session, board_id, user.id)
        if member is None or member.status != MemberStatus.PENDING.value:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="No pending invitation found",
            )

        try:
            self.board_members_repo.set_status(session, member, MemberStatus.DECLINED)
            session.commit()
        except Exception:
            session.rollback()
            raise
