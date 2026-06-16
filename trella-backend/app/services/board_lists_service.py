"""board_lists service layer.

Service (business logic) for the ``board_lists`` domain.

Owns the transaction for list writes and orchestrates the cross-domain rules
required around a list create/update/delete:

- org-scoping: a List has no ``org_id`` of its own, so the owning organization is
  resolved through the list's board (``list.board_id -> boards.get -> org_id``)
  per design.md section 4 / Req 4.4. ``OrganizationMemberService.assert_member``
  then enforces membership — a non-member gets HTTP 403
  ``"Not a member of this organization"`` (Req 4.1, 4.2);
- ordering: a new list is appended at ``max_order(board) + 1`` so the first list
  of a board gets order 0 (Req 6.1);
- delete cascade: removing a List removes its cards via the FK
  ``ON DELETE CASCADE`` on Postgres (Req 6.3);
- an ``AuditLog`` row for every successful create/update/delete, written through
  ``AuditLogsService.record`` in the SAME session so it lives or dies with the
  operation (Req 8.1).

Per the layering rules the service never queries other domains' tables directly:
it resolves the owning org through the ``BoardsRepository`` (the only
cross-domain lookup needed for org-scoping) and delegates membership/audit work
to the relevant SERVICE. It only touches ``lists`` through its own
``BoardListsRepository``. The repository stages/flushes without committing, so
the service commits exactly once at the end of each write and the list change
and the audit row commit atomically (design.md sections 7 & 8).

This module implements tasks 14.2, 14.3 and 14.4: ``create_list``,
``update_list``, ``delete_list``, the atomic ``reorder_lists`` and ``copy_list``
(duplicate a list and its cards, preserving relative card order). The router
(task 14.5) is out of scope here.

See requirements 4.1, 4.2, 4.4, 6.1, 6.2, 6.3, 6.4, 6.5, 8.1, 11.1, 11.2, 11.3,
11.4 and design.md sections "4. Dependency Injection (deps)",
"5. Thuật toán Reorder (atomic)", "7. Audit Log do Service tạo".
"""

import uuid

from fastapi import HTTPException, status
from sqlmodel import Session

from app.models.audit_logs_model import AuditAction, EntityType
from app.models.board_lists_model import List
from app.models.task_cards_model import Card
from app.models.users_model import User
from app.repositories.board_lists_repository import BoardListsRepository
from app.repositories.boards_repository import BoardsRepository
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
    ) -> None:
        self.repo = repo or BoardListsRepository()
        self.boards_repo = boards_repo or BoardsRepository()
        self.org_member_service = org_member_service or OrganizationMemberService()
        self.audit_service = audit_service or AuditLogsService()
        self.cards_repo = cards_repo or TaskCardsRepository()

    def _resolve_board_org_id(self, session: Session, board_id: uuid.UUID) -> uuid.UUID:
        """Resolve the owning organization's id through the list's board.

        A List carries no ``org_id``; org-scoping derives it via
        ``board_id -> boards.get -> org_id`` (design.md section 4 / Req 4.4).
        Raises HTTP 404 ``"Board not found"`` when the board is absent.
        """
        board = self.boards_repo.get(session, board_id)
        if board is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Board not found",
            )
        return board.org_id

    def create_list(self, session: Session, data: ListCreate, user: User) -> List:
        """Create a list appended to the end of its board, atomically.

        Steps, in order:

        1. Resolve the owning org through ``data.board_id`` — HTTP 404
           ``"Board not found"`` when the board is absent (Req 4.4).
        2. Assert ``user`` is a member of that org — else HTTP 403
           ``"Not a member of this organization"`` (Req 4.1, 4.2).
        3. Compute ``order = max_order(board) + 1`` so the first list of a board
           gets order 0 (Req 6.1).
        4. Create the list through the repository.
        5. Record a CREATE audit row in the same session (Req 8.1).
        6. Commit once so the list and its audit row persist all-or-nothing; on
           any error roll back and re-raise.

        Returns the freshly created, refreshed ``List``.
        """
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
        """Apply a partial update to a list, atomically with its audit row.

        Looks up the list (HTTP 404 ``"List not found"`` when absent), resolves
        the owning org through its board and asserts ``user`` is a member
        (HTTP 403 otherwise), applies only the explicitly provided fields
        (``exclude_unset=True``, PATCH semantics), records an UPDATE audit row in
        the same session, then commits once. On any error the transaction is
        rolled back and the error re-raised (Req 6.2, 4.1, 4.2, 4.4, 8.1).
        """
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
        """Delete a list (and its cards via cascade), atomically with its audit.

        Looks up the list (HTTP 404 ``"List not found"`` when absent), resolves
        the owning org through its board and asserts ``user`` is a member
        (HTTP 403 otherwise). Records a DELETE audit row capturing the list's
        title BEFORE removing it, deletes the list — which cascades to its cards
        via the FK ``ON DELETE CASCADE`` on Postgres (Req 6.3) — then commits
        once. On any error the transaction is rolled back and the error
        re-raised (Req 6.3, 4.1, 4.2, 4.4, 8.1).
        """
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
        """Atomically apply a new ``order`` to every list of a board.

        Steps, in order:

        1. Resolve the owning org through ``board_id`` — HTTP 404
           ``"Board not found"`` when the board is absent — and assert ``user``
           is a member, else HTTP 403 (Req 4.4).
        2. Validate the payload BEFORE touching the DB: fetch every referenced
           list via ``get_lists_by_ids`` and require that the count matches and
           that every row belongs to ``board_id``. Any mismatch raises
           HTTP 400 ``"Invalid reorder payload"`` and leaves the DB unchanged
           (Req 6.5, 11.2).
        3. In ONE transaction, set each list's ``order`` and record an UPDATE
           audit row in the same session (Req 11.4); commit exactly once at the
           end so the whole reorder is all-or-nothing (Req 6.4, 11.1, 11.3). On
           any error roll back the entire transaction and raise HTTP 400
           ``"Reorder failed"``.

        Returns the updated lists (re-read after commit).
        """
        org_id = self._resolve_board_org_id(session, board_id)
        self.org_member_service.assert_member(session, org_id, user.id)

        ids = [item.id for item in items]
        rows = self.repo.get_lists_by_ids(session, ids)
        if len(rows) != len(ids) or any(row.board_id != board_id for row in rows):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid reorder payload",
            )

        # Map id -> title so each audit row carries the list's title without an
        # extra per-item DB lookup.
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
        """Duplicate a list and its cards into the same board, atomically.

        Steps, in order:

        1. Look up the source list (HTTP 404 ``"List not found"`` when absent),
           resolve the owning org through its board (HTTP 404 ``"Board not
           found"``) and assert ``user`` is a member, else HTTP 403 (Req 4.4).
        2. Create a NEW list appended to the end of the same board:
           ``title = "{source.title} - Copy"``, same ``board_id`` and
           ``order = max_order(board) + 1`` (Req 6.6).
        3. Copy every card of the source list into the new list, preserving the
           relative order: iterate the source's cards ordered by ``order``
           ascending and recreate each as a new ``Card`` under the new list,
           keeping the same ``order`` value (Req 6.6).
        4. Record a CREATE audit row for the NEW list in the same session
           (design.md section 6 / Req 8.1).
        5. Commit once so the new list, its copied cards and the audit row
           persist all-or-nothing; on any error roll back and re-raise.

        Returns the freshly created, refreshed ``List``.
        """
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
