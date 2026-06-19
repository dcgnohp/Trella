import uuid

from fastapi import HTTPException, status
from sqlmodel import Session

from app.models.audit_logs_model import AuditAction, EntityType
from app.models.board_lists_model import List
from app.models.task_cards_model import Card
from app.models.users_model import User
from app.repositories.board_lists_repository import BoardListsRepository
from app.repositories.boards_repository import BoardsRepository
from app.repositories.projects_repository import ProjectsRepository
from app.repositories.task_cards_repository import TaskCardsRepository
from app.schemas.board_lists_schema import ListCreate, ListReorderItem, ListUpdate
from app.services.audit_logs_service import AuditLogsService
from app.services.organization_members_service import OrganizationMemberService


class BoardListsService:
    """Business logic for the ``board_lists`` domain (create / update / delete)."""

    def __init__(
        self,
        repo: BoardListsRepository | None = None,
        boards_repo: BoardsRepository | None = None,
        org_member_service: OrganizationMemberService | None = None,
        audit_service: AuditLogsService | None = None,
        cards_repo: TaskCardsRepository | None = None,
        projects_repo: ProjectsRepository | None = None,
    ) -> None:
        self.repo = repo or BoardListsRepository()
        self.boards_repo = boards_repo or BoardsRepository()
        self.org_member_service = org_member_service or OrganizationMemberService()
        self.audit_service = audit_service or AuditLogsService()
        self.cards_repo = cards_repo or TaskCardsRepository()
        self.projects_repo = projects_repo or ProjectsRepository()

    def _resolve_board_org_id(self, session: Session, board_id: uuid.UUID) -> uuid.UUID:
        """Resolve workspace id via board -> project -> workspace. Raises HTTP 404 if board is absent."""
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
        return project.workspace_id

    def create_list(self, session: Session, data: ListCreate, user: User) -> List:
        """Create a list appended to the end of its board. Raises HTTP 403 if user is not a member."""
        org_id = self._resolve_board_org_id(session, data.board_id)
        self.org_member_service.assert_member(session, org_id, user.id)
        order = self.repo.max_order(session, data.board_id) + 1
        try:
            board_list = self.repo.create(
                session,
                List(title=data.title, board_id=data.board_id, order=order),
            )
            self.audit_service.record(
                session,
                AuditAction.CREATE,
                EntityType.LIST,
                board_list.id,
                board_list.title,
                user,
                org_id=org_id,
            )
            session.commit()
        except Exception:
            session.rollback()
            raise
        session.refresh(board_list)
        return board_list

    def update_list(
        self,
        session: Session,
        list_id: uuid.UUID,
        data: ListUpdate,
        user: User,
    ) -> List:
        """Apply a partial update to a list. Raises HTTP 404 if not found, HTTP 403 if user is not a member."""
        board_list = self.repo.get(session, list_id)
        if board_list is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="List not found",
            )
        org_id = self._resolve_board_org_id(session, board_list.board_id)
        self.org_member_service.assert_member(session, org_id, user.id)
        updates = data.model_dump(exclude_unset=True)
        for field, value in updates.items():
            setattr(board_list, field, value)
        try:
            board_list = self.repo.update(session, board_list)
            self.audit_service.record(
                session,
                AuditAction.UPDATE,
                EntityType.LIST,
                board_list.id,
                board_list.title,
                user,
                org_id=org_id,
            )
            session.commit()
        except Exception:
            session.rollback()
            raise
        session.refresh(board_list)
        return board_list

    def delete_list(self, session: Session, list_id: uuid.UUID, user: User) -> None:
        """Delete a list and its cards. Raises HTTP 404 if not found, HTTP 403 if user is not a member."""
        board_list = self.repo.get(session, list_id)
        if board_list is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="List not found",
            )
        org_id = self._resolve_board_org_id(session, board_list.board_id)
        self.org_member_service.assert_member(session, org_id, user.id)
        try:
            self.audit_service.record(
                session,
                AuditAction.DELETE,
                EntityType.LIST,
                board_list.id,
                board_list.title,
                user,
                org_id=org_id,
            )
            self.repo.delete(session, board_list)
            session.commit()
        except Exception:
            session.rollback()
            raise

    def reorder_lists(
        self,
        session: Session,
        board_id: uuid.UUID,
        items: list[ListReorderItem],
        user: User,
    ) -> list[List]:
        """Atomically apply a new order to every list of a board. Raises HTTP 400 if payload is invalid."""
        org_id = self._resolve_board_org_id(session, board_id)
        self.org_member_service.assert_member(session, org_id, user.id)

        ids = [item.id for item in items]
        rows = self.repo.get_lists_by_ids(session, ids)
        if len(rows) != len(ids) or any(row.board_id != board_id for row in rows):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid reorder payload",
            )

        titles = {row.id: row.title for row in rows}
        try:
            for item in items:
                self.repo.update_order(session, item.id, item.order)
                self.audit_service.record(
                    session,
                    AuditAction.UPDATE,
                    EntityType.LIST,
                    item.id,
                    titles[item.id],
                    user,
                    org_id=org_id,
                )
            session.commit()
        except Exception:
            session.rollback()
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Reorder failed",
            )
        return self.repo.get_lists_by_ids(session, ids)

    def copy_list(self, session: Session, list_id: uuid.UUID, user: User) -> List:
        """Duplicate a list and its cards into the same board. Raises HTTP 404 if not found, HTTP 403 if user is not a member."""
        source = self.repo.get(session, list_id)
        if source is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="List not found",
            )
        org_id = self._resolve_board_org_id(session, source.board_id)
        self.org_member_service.assert_member(session, org_id, user.id)

        source_cards = self.cards_repo.list_by_list(session, source.id)
        order = self.repo.max_order(session, source.board_id) + 1
        try:
            new_list = self.repo.create(
                session,
                List(
                    title=f"{source.title} - Copy",
                    board_id=source.board_id,
                    order=order,
                ),
            )
            for card in source_cards:
                self.cards_repo.create(
                    session,
                    Card(
                        list_id=new_list.id,
                        title=card.title,
                        description=card.description,
                        order=card.order,
                    ),
                )
            self.audit_service.record(
                session,
                AuditAction.CREATE,
                EntityType.LIST,
                new_list.id,
                new_list.title,
                user,
                org_id=org_id,
            )
            session.commit()
        except Exception:
            session.rollback()
            raise
        session.refresh(new_list)
        return new_list
