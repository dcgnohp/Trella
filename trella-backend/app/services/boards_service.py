import uuid

from fastapi import HTTPException, status
from sqlmodel import Session

from app.models.audit_logs_model import AuditAction, EntityType
from app.models.board_columns_model import BoardColumn
from app.models.boards_model import Board
from app.models.users_model import User
from app.repositories.board_lists_repository import BoardListsRepository
from app.repositories.boards_repository import BoardsRepository
from app.repositories.projects_repository import ProjectsRepository
from app.repositories.task_cards_repository import TaskCardsRepository
from app.schemas.boards_schema import (
    BoardCreate,
    BoardDetail,
    BoardPublic,
    BoardUpdate,
    CardPublic,
    ListWithCards,
)
from app.services.audit_logs_service import AuditLogsService
from app.services.org_limits_service import OrgLimitService
from app.services.organization_members_service import OrganizationMemberService


class BoardsService:
    """Business logic for the ``boards`` domain (create / update / get)."""

    def __init__(
        self,
        repo: BoardsRepository | None = None,
        org_member_service: OrganizationMemberService | None = None,
        org_limit_service: OrgLimitService | None = None,
        audit_service: AuditLogsService | None = None,
        board_lists_repo: BoardListsRepository | None = None,
        task_cards_repo: TaskCardsRepository | None = None,
        projects_repo: ProjectsRepository | None = None,
    ) -> None:
        self.repo = repo or BoardsRepository()
        self.org_member_service = org_member_service or OrganizationMemberService()
        self.org_limit_service = org_limit_service or OrgLimitService()
        self.audit_service = audit_service or AuditLogsService()
        self.board_lists_repo = board_lists_repo or BoardListsRepository()
        self.task_cards_repo = task_cards_repo or TaskCardsRepository()
        self.projects_repo = projects_repo or ProjectsRepository()

    def _resolve_workspace_id(self, session: Session, board: Board) -> uuid.UUID:
        """Resolve the owning workspace id via board.project_id. Raises HTTP 500 if the project is missing."""
        project = self.projects_repo.get(session, board.project_id)
        if project is None:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Owning project for board not found",
            )
        return project.workspace_id

    def _resolve_default_project_id(
        self, session: Session, workspace_id: uuid.UUID
    ) -> uuid.UUID:
        """Return the default project id for a workspace. Raises HTTP 404 if no project exists."""
        projects = self.projects_repo.list_by_workspace(session, workspace_id)
        if not projects:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No project found for this workspace",
            )
        for project in projects:
            if project.key == "DEFAULT":
                return project.id
        return projects[0].id

    def to_public(self, session: Session, board: Board) -> BoardPublic:
        """Build a BoardPublic, resolving org_id from the board's project for backward compatibility."""
        return BoardPublic(
            id=board.id,
            org_id=self._resolve_workspace_id(session, board),
            project_id=board.project_id,
            title=board.title,
            image_id=board.image_id,
            image_thumb_url=board.image_thumb_url,
            image_full_url=board.image_full_url,
            image_user_name=board.image_user_name,
            image_link_html=board.image_link_html,
            created_at=board.created_at,
            updated_at=board.updated_at,
        )

    def create_board(self, session: Session, data: BoardCreate, user: User) -> Board:
        """Create a board, enforcing membership and free-tier cap, with atomic audit log."""
        self.org_member_service.assert_member(session, data.org_id, user.id)
        if not self.org_limit_service.has_available_count(session, data.org_id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Free tier board limit reached",
            )
        project_id = self._resolve_default_project_id(session, data.org_id)
        try:
            board = self.repo.create(
                session,
                Board(
                    project_id=project_id,
                    **data.model_dump(exclude={"org_id"}),
                ),
            )
            self.org_limit_service.increment_available_count(session, data.org_id)
            self.audit_service.record(
                session,
                AuditAction.CREATE,
                EntityType.BOARD,
                board.id,
                board.title,
                user,
                org_id=data.org_id,
            )
            
            # Auto-assign creator as BOARD_ADMIN
            from app.models.board_members_model import BoardMember
            from app.models.enums import BoardRole, MemberStatus

            session.add(
                BoardMember(
                    board_id=board.id,
                    user_id=user.id,
                    role=BoardRole.BOARD_ADMIN.value,
                    status=MemberStatus.ACTIVE.value,
                    invited_by=user.id,
                )
            )

            session.commit()
        except Exception:
            session.rollback()
            raise
        session.refresh(board)
        return board

    def update_board(
        self,
        session: Session,
        board_id: uuid.UUID,
        data: BoardUpdate,
        user: User,
    ) -> Board:
        """Apply a partial update to a board, enforcing membership, with atomic audit log."""
        board = self.repo.get(session, board_id)
        if board is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Board not found",
            )
        workspace_id = self._resolve_workspace_id(session, board)
        self.org_member_service.assert_member(session, workspace_id, user.id)
        updates = data.model_dump(exclude_unset=True)
        for field, value in updates.items():
            setattr(board, field, value)
        try:
            board = self.repo.update(session, board)
            self.audit_service.record(
                session,
                AuditAction.UPDATE,
                EntityType.BOARD,
                board.id,
                board.title,
                user,
                org_id=workspace_id,
            )
            session.commit()
        except Exception:
            session.rollback()
            raise
        session.refresh(board)
        return board

    def get_board(self, session: Session, board_id: uuid.UUID, user: User) -> Board:
        """Return a board by id. Raises HTTP 404 if not found, HTTP 403 if user is not a member."""
        board = self.repo.get(session, board_id)
        if board is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Board not found",
            )
        self.org_member_service.assert_member(
            session, self._resolve_workspace_id(session, board), user.id
        )
        return board

    def list_boards(
        self, session: Session, org_id: uuid.UUID, user: User
    ) -> list[Board]:
        """Return all boards for a workspace. Raises HTTP 403 if user is not a member."""
        self.org_member_service.assert_member(session, org_id, user.id)
        return self.repo.list_by_workspace(session, org_id)

    def get_board_detail(
        self, session: Session, board_id: uuid.UUID, user: User
    ) -> BoardDetail:
        """Return a board with its lists and cards nested. Raises HTTP 404/403 on missing board or non-member."""
        board = self.repo.get(session, board_id)
        if board is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Board not found",
            )
        workspace_id = self._resolve_workspace_id(session, board)
        self.org_member_service.assert_member(session, workspace_id, user.id)

        lists_with_cards: list[ListWithCards] = []
        for board_list in self.board_lists_repo.list_by_board(session, board.id):
            cards = [
                CardPublic.model_validate(card, from_attributes=True)
                for card in self.task_cards_repo.list_by_list(session, board_list.id)
            ]
            lists_with_cards.append(
                ListWithCards.model_validate(
                    board_list, from_attributes=True
                ).model_copy(update={"cards": cards})
            )

        return BoardDetail(
            id=board.id,
            org_id=workspace_id,
            project_id=board.project_id,
            title=board.title,
            image_id=board.image_id,
            image_thumb_url=board.image_thumb_url,
            image_full_url=board.image_full_url,
            image_user_name=board.image_user_name,
            image_link_html=board.image_link_html,
            created_at=board.created_at,
            updated_at=board.updated_at,
            lists=lists_with_cards,
        )

    def delete_board(self, session: Session, board_id: uuid.UUID, user: User) -> None:
        """Delete a board and its descendants, atomically with count decrement and audit log."""
        board = self.repo.get(session, board_id)
        if board is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Board not found",
            )
        org_id = self._resolve_workspace_id(session, board)
        self.org_member_service.assert_member(session, org_id, user.id)
        board_title = board.title
        try:
            self.repo.delete(session, board)
            self.org_limit_service.decrement_available_count(session, org_id)
            self.audit_service.record(
                session,
                AuditAction.DELETE,
                EntityType.BOARD,
                board_id,
                board_title,
                user,
                org_id=org_id,
            )
            session.commit()
        except Exception:
            session.rollback()
            raise
