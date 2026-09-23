import uuid

from fastapi import HTTPException, status
from sqlmodel import Session

from app.models.audit_logs_model import AuditAction, EntityType
from app.models.task_cards_model import Card
from app.models.users_model import User
from app.repositories.board_lists_repository import BoardListsRepository
from app.repositories.boards_repository import BoardsRepository
from app.repositories.projects_repository import ProjectsRepository
from app.repositories.task_cards_repository import TaskCardsRepository
from app.schemas.task_cards_schema import CardCreate, CardReorderItem, CardUpdate
from app.services.audit_logs_service import AuditLogsService
from app.services.organization_members_service import OrganizationMemberService


class TaskCardsService:
    """Business logic for the ``task_cards`` domain (create / update / delete)."""

    def __init__(
        self,
        repo: TaskCardsRepository | None = None,
        lists_repo: BoardListsRepository | None = None,
        boards_repo: BoardsRepository | None = None,
        org_member_service: OrganizationMemberService | None = None,
        audit_service: AuditLogsService | None = None,
        projects_repo: ProjectsRepository | None = None,
    ) -> None:
        self.repo = repo or TaskCardsRepository()
        self.lists_repo = lists_repo or BoardListsRepository()
        self.boards_repo = boards_repo or BoardsRepository()
        self.org_member_service = org_member_service or OrganizationMemberService()
        self.audit_service = audit_service or AuditLogsService()
        self.projects_repo = projects_repo or ProjectsRepository()

    def _resolve_list_org_id(self, session: Session, list_id: uuid.UUID) -> uuid.UUID:
        """Resolve the owning workspace id via list -> board -> project. Raises HTTP 404 if list or board is absent."""
        board_list = self.lists_repo.get(session, list_id)
        if board_list is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="List not found",
            )
        board = self.boards_repo.get(session, board_list.board_id)
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

    def create_card(self, session: Session, data: CardCreate, user: User) -> Card:
        """Create a card appended to the end of its list. Raises HTTP 403 if user is not a member."""
        org_id = self._resolve_list_org_id(session, data.list_id)
        self.org_member_service.assert_member(session, org_id, user.id)
        order = self.repo.max_order(session, data.list_id) + 1
        try:
            card = self.repo.create(
                session,
                Card(title=data.title, list_id=data.list_id, order=order),
            )
            self.audit_service.record(
                session,
                AuditAction.CREATE,
                EntityType.CARD,
                card.id,
                card.title,
                user,
                org_id=org_id,
            )
            session.commit()
        except Exception:
            session.rollback()
            raise
        session.refresh(card)
        return card

    def update_card(
        self,
        session: Session,
        card_id: uuid.UUID,
        data: CardUpdate,
        user: User,
    ) -> Card:
        """Apply a partial update to a card. Raises HTTP 404 if not found, HTTP 403 if user is not a member."""
        card = self.repo.get(session, card_id)
        if card is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Card not found",
            )
        org_id = self._resolve_list_org_id(session, card.list_id)
        self.org_member_service.assert_member(session, org_id, user.id)
        updates = data.model_dump(exclude_unset=True)
        for field, value in updates.items():
            setattr(card, field, value)
        try:
            card = self.repo.update(session, card)
            self.audit_service.record(
                session,
                AuditAction.UPDATE,
                EntityType.CARD,
                card.id,
                card.title,
                user,
                org_id=org_id,
            )
            session.commit()
        except Exception:
            session.rollback()
            raise
        session.refresh(card)
        return card

    def delete_card(self, session: Session, card_id: uuid.UUID, user: User) -> None:
        """Delete a card and its audit row atomically. Raises HTTP 404 if not found, HTTP 403 if user is not a member."""
        card = self.repo.get(session, card_id)
        if card is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Card not found",
            )
        org_id = self._resolve_list_org_id(session, card.list_id)
        self.org_member_service.assert_member(session, org_id, user.id)
        try:
            self.audit_service.record(
                session,
                AuditAction.DELETE,
                EntityType.CARD,
                card.id,
                card.title,
                user,
                org_id=org_id,
            )
            self.repo.delete(session, card)
            session.commit()
        except Exception:
            session.rollback()
            raise

    def reorder_cards(
        self,
        session: Session,
        items: list[CardReorderItem],
        user: User,
    ) -> list[Card]:
        """Atomically apply new order/list assignments to a set of cards.

        All cards and target lists must belong to the same Board. Raises HTTP 400
        if the payload is invalid or any card/list spans a different board.
        Raises HTTP 403 if user is not a member.
        """
        ids = [item.id for item in items]
        rows = self.repo.get_cards_by_ids(session, ids)
        if len(rows) != len(ids):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid reorder payload",
            )

        # Require all cards share a single Board.
        board_id = self._resolve_card_board_id(session, rows[0])
        for row in rows[1:]:
            if self._resolve_card_board_id(session, row) != board_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid reorder payload",
                )

        # Every TARGET list must belong to that same Board too.
        for item in items:
            target_list = self.lists_repo.get(session, item.list_id)
            if target_list is None or target_list.board_id != board_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid reorder payload",
                )

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
        org_id = project.workspace_id
        self.org_member_service.assert_member(session, org_id, user.id)

        titles = {row.id: row.title for row in rows}
        try:
            for item in items:
                self.repo.update_order_and_list(
                    session, item.id, item.order, item.list_id
                )
                self.audit_service.record(
                    session,
                    AuditAction.UPDATE,
                    EntityType.CARD,
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
        return self.repo.get_cards_by_ids(session, ids)

    def copy_card(self, session: Session, card_id: uuid.UUID, user: User) -> Card:
        """Duplicate a card within its list, appended at the end. Raises HTTP 403 if user is not a member."""
        source = self.repo.get(session, card_id)
        if source is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Card not found",
            )
        org_id = self._resolve_list_org_id(session, source.list_id)
        self.org_member_service.assert_member(session, org_id, user.id)
        order = self.repo.max_order(session, source.list_id) + 1
        try:
            card = self.repo.create(
                session,
                Card(
                    title=f"{source.title} - Copy",
                    list_id=source.list_id,
                    description=source.description,
                    order=order,
                ),
            )
            self.audit_service.record(
                session,
                AuditAction.CREATE,
                EntityType.CARD,
                card.id,
                card.title,
                user,
                org_id=org_id,
            )
            session.commit()
        except Exception:
            session.rollback()
            raise
        session.refresh(card)
        return card

    def _resolve_card_board_id(self, session: Session, card: Card) -> uuid.UUID:
        """Resolve the Board id for a card via its current list. Raises HTTP 400 if the list is absent."""
        board_list = self.lists_repo.get(session, card.list_id)
        if board_list is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid reorder payload",
            )
        return board_list.board_id
