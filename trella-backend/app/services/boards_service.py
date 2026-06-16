"""boards service layer.

Service (business logic) for the ``boards`` domain.

Owns the transaction for board writes and orchestrates the cross-domain rules
required around a board create/update:

- org-scoping via ``OrganizationMemberService.assert_member`` — a non-member gets
  HTTP 403 ``"Not a member of this organization"`` (Req 4.1, 4.2);
- the free-tier board cap via ``OrgLimitService`` — when no slot is available the
  create is rejected with HTTP 403 ``"Free tier board limit reached"`` (Req 5.5);
- keeping ``OrgLimit.count`` in step by incrementing it on a successful create
  (Req 5.6, 9.2, 9.4);
- an ``AuditLog`` row for every successful create/update, written through
  ``AuditLogsService.record`` in the SAME session so it lives or dies with the
  operation (Req 8.1).

Per the layering rules the service never queries other domains' tables directly:
it delegates to the relevant SERVICE (``OrganizationMemberService``,
``OrgLimitService``, ``AuditLogsService``) and only touches ``boards`` through its
own ``BoardsRepository``. The repository stages/flushes without committing, so
the service commits exactly once at the end of each write and the board, the
limit change and the audit row commit atomically (design.md sections 7 & 8).

This module implements tasks 13.2 and 13.3: ``create_board``, ``update_board``,
``get_board``, the nested ``get_board_detail`` and ``delete_board``. The router
belongs to task 13.4.

See requirements 4.1, 4.2, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 8.1, 9.2, 9.4, 9.5 and
design.md sections "Service interface (mẫu Board)", "3. Nested response cho GET
board", "7. Audit Log do Service tạo" and "8. OrgLimit & OrgSubscription".
"""

import uuid

from fastapi import HTTPException, status
from sqlmodel import Session

from app.models.audit_logs_model import AuditAction, EntityType
from app.models.boards_model import Board
from app.models.users_model import User
from app.repositories.board_lists_repository import BoardListsRepository
from app.repositories.boards_repository import BoardsRepository
from app.repositories.task_cards_repository import TaskCardsRepository
from app.schemas.boards_schema import (
    BoardCreate,
    BoardDetail,
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
    ) -> None:
        self.repo = repo or BoardsRepository()
        self.org_member_service = org_member_service or OrganizationMemberService()
        self.org_limit_service = org_limit_service or OrgLimitService()
        self.audit_service = audit_service or AuditLogsService()
        self.board_lists_repo = board_lists_repo or BoardListsRepository()
        self.task_cards_repo = task_cards_repo or TaskCardsRepository()

    def create_board(
        self, session: Session, data: BoardCreate, user: User
    ) -> Board:
        """Create a board for an organization, atomically with its side effects.

        Steps, in order (design.md "Service interface (mẫu Board)"):

        1. Assert ``user`` is a member of ``data.org_id`` — else HTTP 403
           ``"Not a member of this organization"`` (Req 4.1, 4.2).
        2. Check the free-tier cap via ``OrgLimitService.has_available_count`` —
           when no slot is available reject with HTTP 403
           ``"Free tier board limit reached"`` (Req 5.5).
        3. Create the board through the repository (Req 5.1).
        4. Increment the org's board count (Req 5.6, 9.2, 9.4).
        5. Record a CREATE audit row in the same session (Req 8.1).
        6. Commit once so the board, the count bump and the audit row persist
           all-or-nothing; on any error roll back and re-raise.

        Returns the freshly created, refreshed ``Board``.
        """
        self.org_member_service.assert_member(session, data.org_id, user.id)
        if not self.org_limit_service.has_available_count(session, data.org_id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Free tier board limit reached",
            )
        try:
            board = self.repo.create(session, Board(**data.model_dump()))
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
        """Apply a partial update to a board, atomically with its audit row.

        Looks up the board (HTTP 404 ``"Board not found"`` when absent), asserts
        ``user`` is a member of the owning organization via ``board.org_id``
        (HTTP 403 otherwise), applies only the explicitly provided fields
        (``exclude_unset=True``, PATCH semantics), records an UPDATE audit row in
        the same session, then commits once. On any error the transaction is
        rolled back and the error re-raised (Req 5.3, 4.1, 4.2, 8.1).
        """
        board = self.repo.get(session, board_id)
        if board is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Board not found",
            )
        self.org_member_service.assert_member(session, board.org_id, user.id)
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
                org_id=board.org_id,
            )
            session.commit()
        except Exception:
            session.rollback()
            raise
        session.refresh(board)
        return board

    def get_board(
        self, session: Session, board_id: uuid.UUID, user: User
    ) -> Board:
        """Return a single board, enforcing org-scoping.

        Looks up the board (HTTP 404 ``"Board not found"`` when absent) and
        asserts ``user`` is a member of the owning organization via
        ``board.org_id`` (HTTP 403 ``"Not a member of this organization"``
        otherwise) before returning it (Req 4.1, 4.2). The nested detail variant
        with lists/cards is ``get_board_detail`` (task 13.3).
        """
        board = self.repo.get(session, board_id)
        if board is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Board not found",
            )
        self.org_member_service.assert_member(session, board.org_id, user.id)
        return board

    def list_boards(
        self, session: Session, org_id: uuid.UUID, user: User
    ) -> list[Board]:
        """Return all boards of an organization the user is a member of.

        Asserts ``user`` is a member of ``org_id`` (HTTP 403 ``"Not a member of
        this organization"`` otherwise) before returning the org-scoped boards
        via ``BoardsRepository.list_by_org`` (Req 4.1, 4.2; org-scoped listing
        per Req 4). A non-member sees no boards.
        """
        self.org_member_service.assert_member(session, org_id, user.id)
        return self.repo.list_by_org(session, org_id)

    def get_board_detail(
        self, session: Session, board_id: uuid.UUID, user: User
    ) -> BoardDetail:
        """Return a board with its lists and cards nested, in ascending order.

        Looks up the board (HTTP 404 ``"Board not found"`` when absent) and
        asserts ``user`` is a member of the owning organization via
        ``board.org_id`` (HTTP 403 ``"Not a member of this organization"``
        otherwise) before building the nested response (Req 4.1, 4.2).

        Loads the board's lists via ``BoardListsRepository.list_by_board`` (which
        already orders by ``order`` ascending) and, for each list, its cards via
        ``TaskCardsRepository.list_by_list`` (also ``order`` ascending), mapping
        them into a ``BoardDetail`` whose ``lists`` each carry their ``cards`` —
        ascending order preserved at both levels (Req 5.2, design.md section
        "3. Nested response cho GET board").
        """
        board = self.repo.get(session, board_id)
        if board is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Board not found",
            )
        self.org_member_service.assert_member(session, board.org_id, user.id)

        lists_with_cards: list[ListWithCards] = []
        for board_list in self.board_lists_repo.list_by_board(session, board.id):
            cards = [
                CardPublic.model_validate(card, from_attributes=True)
                for card in self.task_cards_repo.list_by_list(
                    session, board_list.id
                )
            ]
            lists_with_cards.append(
                ListWithCards.model_validate(
                    board_list, from_attributes=True
                ).model_copy(update={"cards": cards})
            )

        return BoardDetail.model_validate(board, from_attributes=True).model_copy(
            update={"lists": lists_with_cards}
        )

    def delete_board(
        self, session: Session, board_id: uuid.UUID, user: User
    ) -> None:
        """Delete a board and its descendants, atomically with its side effects.

        Looks up the board (HTTP 404 ``"Board not found"`` when absent), asserts
        ``user`` is a member of the owning organization via ``board.org_id``
        (HTTP 403 otherwise), then in ONE transaction:

        1. deletes the board through the repository — the DB-level
           ``ON DELETE CASCADE`` on ``lists.board_id`` / ``cards.list_id`` removes
           the board's lists and cards (Req 5.4);
        2. decrements the org's board count via
           ``OrgLimitService.decrement_available_count`` (Req 9.5, 8.1);
        3. records a DELETE audit row in the same session (Req 8.1);
        4. commits once so the delete, the count decrement and the audit row
           persist all-or-nothing; on any error rolls back and re-raises.

        Note: the cascade is enforced by the database (the real store is
        Postgres). On SQLite ``PRAGMA foreign_keys`` is OFF by default, so the
        child rows are only removed when that pragma is enabled; the board row
        removal, count decrement and audit row are independent of it.
        """
        board = self.repo.get(session, board_id)
        if board is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Board not found",
            )
        self.org_member_service.assert_member(session, board.org_id, user.id)
        org_id = board.org_id
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
