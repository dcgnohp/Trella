"""task_cards service layer.

Service (business logic) for the ``task_cards`` domain.

Owns the transaction for card writes and orchestrates the cross-domain rules
required around a card create/update/delete:

- org-scoping: a Card has no ``org_id`` of its own, nor does its ``List``, so the
  owning organization is resolved through the chain
  ``card.list_id -> lists.get -> list.board_id -> boards.get -> org_id``
  (design.md section 4 / Req 4.4). ``OrganizationMemberService.assert_member``
  then enforces membership — a non-member gets HTTP 403
  ``"Not a member of this organization"``;
- ordering: a new card is appended at ``max_order(list) + 1`` so the first card
  of a list gets order 0 (Req 7.1);
- an ``AuditLog`` row for every successful create/update/delete, written through
  ``AuditLogsService.record`` in the SAME session so it lives or dies with the
  operation (Req 8.1).

Per the layering rules the service never queries other domains' tables directly
for business data: it resolves the owning org through the ``BoardListsRepository``
and ``BoardsRepository`` (the only cross-domain lookups needed for org-scoping)
and delegates membership/audit work to the relevant SERVICE. It only touches
``cards`` through its own ``TaskCardsRepository``. The repository
stages/flushes without committing, so the service commits exactly once at the
end of each write and the card change and the audit row commit atomically
(design.md sections 7 & 8).

This module implements tasks 15.2, 15.3 and 15.4: ``create_card``,
``update_card``, ``delete_card``, the atomic ``reorder_cards`` (which validates
that every card and every target list belong to the SAME Board before applying
all updates in one transaction) and ``copy_card`` (duplicate a card within its
list, appended at ``max_order + 1``). The router (task 15.5) is out of scope
here.

See requirements 4.4, 7.1, 7.2, 7.3, 7.4, 7.5, 8.1, 11.1, 11.2, 11.3, 11.4 and
design.md sections "4. Dependency Injection (deps)", "5. Thuật toán Reorder
(atomic)", "7. Audit Log do Service tạo".
"""

import uuid

from fastapi import HTTPException, status
from sqlmodel import Session

from app.models.audit_logs_model import AuditAction, EntityType
from app.models.task_cards_model import Card
from app.models.users_model import User
from app.repositories.board_lists_repository import BoardListsRepository
from app.repositories.boards_repository import BoardsRepository
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
    ) -> None:
        self.repo = repo or TaskCardsRepository()
        self.lists_repo = lists_repo or BoardListsRepository()
        self.boards_repo = boards_repo or BoardsRepository()
        self.org_member_service = org_member_service or OrganizationMemberService()
        self.audit_service = audit_service or AuditLogsService()

    def _resolve_list_org_id(
        self, session: Session, list_id: uuid.UUID
    ) -> uuid.UUID:
        """Resolve the owning organization's id through the card's list+board.

        A Card carries no ``org_id`` and neither does its ``List``; org-scoping
        derives it via ``list_id -> lists.get -> board_id -> boards.get -> org_id``
        (design.md section 4 / Req 4.4). Raises HTTP 404 ``"List not found"``
        when the list is absent, or ``"Board not found"`` when its board is
        absent.
        """
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
        return board.org_id

    def create_card(
        self, session: Session, data: CardCreate, user: User
    ) -> Card:
        """Create a card appended to the end of its list, atomically.

        Steps, in order:

        1. Resolve the owning org through ``data.list_id`` — HTTP 404
           ``"List not found"`` / ``"Board not found"`` when absent (Req 4.4).
        2. Assert ``user`` is a member of that org — else HTTP 403
           ``"Not a member of this organization"``.
        3. Compute ``order = max_order(list) + 1`` so the first card of a list
           gets order 0 (Req 7.1).
        4. Create the card through the repository.
        5. Record a CREATE audit row in the same session (Req 8.1).
        6. Commit once so the card and its audit row persist all-or-nothing; on
           any error roll back and re-raise.

        Returns the freshly created, refreshed ``Card``.
        """
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
        """Apply a partial update to a card, atomically with its audit row.

        Looks up the card (HTTP 404 ``"Card not found"`` when absent), resolves
        the owning org through its list+board and asserts ``user`` is a member
        (HTTP 403 otherwise), applies only the explicitly provided fields
        (``title`` / ``description`` with ``exclude_unset=True``, PATCH
        semantics), records an UPDATE audit row in the same session, then commits
        once. On any error the transaction is rolled back and the error
        re-raised (Req 7.2, 4.4, 8.1).
        """
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

    def delete_card(
        self, session: Session, card_id: uuid.UUID, user: User
    ) -> None:
        """Delete a card, atomically with its audit row.

        Looks up the card (HTTP 404 ``"Card not found"`` when absent), resolves
        the owning org through its list+board and asserts ``user`` is a member
        (HTTP 403 otherwise). Records a DELETE audit row capturing the card's
        title BEFORE removing it, deletes the card, then commits once. On any
        error the transaction is rolled back and the error re-raised
        (Req 7.3, 4.4, 8.1).
        """
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
        """Atomically apply a new ``order`` (and target list) to a set of cards.

        Card reorder can move cards across lists, so each item carries the
        TARGET ``list_id``. All cards — and all target lists — must belong to the
        SAME Board.

        Steps, in order:

        1. Fetch every referenced card via ``get_cards_by_ids``; if any id is
           missing (count mismatch) raise HTTP 400 ``"Invalid reorder payload"``
           and leave the DB unchanged (Req 11.2).
        2. Resolve the Board of each card through its CURRENT ``list_id``
           (``lists.get -> board_id``). Every card must belong to the SAME Board;
           if they span more than one board raise HTTP 400 ``"Invalid reorder
           payload"`` (Req 7.5). Validate that every item's TARGET ``list_id``
           also belongs to that same Board, else HTTP 400.
        3. Resolve the owning org through that single Board and assert ``user`` is
           a member, else HTTP 403 (Req 4.4).
        4. In ONE transaction set each card's ``order`` and ``list_id`` and
           record an UPDATE audit row in the same session (one row per card,
           Req 11.4); commit exactly once at the end so the whole reorder is
           all-or-nothing (Req 7.4, 11.1, 11.3). On any error roll back the
           entire transaction and raise HTTP 400 ``"Reorder failed"``.

        Returns the updated cards (re-read after commit).
        """
        ids = [item.id for item in items]
        rows = self.repo.get_cards_by_ids(session, ids)
        if len(rows) != len(ids):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid reorder payload",
            )

        # Resolve the Board of each card via its CURRENT list, and require they
        # all share a single Board (Req 7.5).
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
        org_id = board.org_id
        self.org_member_service.assert_member(session, org_id, user.id)

        # Map id -> title so each audit row carries the card's title without an
        # extra per-item DB lookup.
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

    def copy_card(
        self, session: Session, card_id: uuid.UUID, user: User
    ) -> Card:
        """Duplicate a card within its list, appended at the end, atomically.

        Steps, in order:

        1. Look up the source card (HTTP 404 ``"Card not found"`` when absent),
           resolve the owning org through its list+board (HTTP 404 ``"List not
           found"`` / ``"Board not found"``) and assert ``user`` is a member,
           else HTTP 403 (Req 4.4).
        2. Create a NEW card in the SAME list: ``title = "{source.title} -
           Copy"``, same ``list_id`` and ``order = max_order(list) + 1`` so the
           copy is appended after the existing cards. The source's
           ``description`` is copied too (Req 7.6).
        3. Record a CREATE audit row for the NEW card in the same session
           (design.md section 6 / Req 8.1).
        4. Commit once so the new card and its audit row persist all-or-nothing;
           on any error roll back and re-raise.

        Returns the freshly created, refreshed ``Card``.
        """
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
        """Resolve the Board id owning ``card`` through its current ``list_id``.

        Raises HTTP 400 ``"Invalid reorder payload"`` when the card's list is
        absent (a reorder payload should only reference live cards/lists).
        """
        board_list = self.lists_repo.get(session, card.list_id)
        if board_list is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid reorder payload",
            )
        return board_list.board_id
