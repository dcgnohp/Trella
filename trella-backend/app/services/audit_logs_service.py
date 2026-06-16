"""audit_logs service layer.

Service (business logic) for the ``audit_logs`` domain.

Two responsibilities:

1. ``record``: the write path Board/List/Card services call to append an audit
   row for a successful Create/Update/Delete. It builds an ``AuditLog`` from the
   acting ``User`` and stages it via the repository in the SAME session — it
   never commits. The originating service owns the transaction and commits once
   at the end, so the audit row is only persisted if the operation commits
   (requirements 8.1, 8.2 / 11).
2. The query paths (``list_for_org`` / ``list_for_board`` / ``list_for_card``)
   that back the three read endpoints. Each enforces org-scoping via
   ``OrganizationMemberService.assert_member`` (HTTP 403 for non-members) before
   returning rows newest-first (requirements 8.3, 8.4, 8.5, 4.1, 4.2, 4.4).

Org-scoping resolution per scope:

- org scope: ``org_id`` is supplied directly by the caller; assert membership,
  then page the org's log.
- board scope: resolve the owning ``Organization`` through the
  ``BoardsRepository`` (404 when the board is missing), assert membership, then
  fetch logs for the board and its descendants.
- card scope: the ``task_cards`` repository does not exist yet (task 15.1), so
  the owning org is derived from the card's own audit rows (every row for a card
  shares one ``org_id``); assert membership against that org before returning.
  When a card has no audit rows there is nothing to authorize or leak, so an
  empty list is returned.

See requirements 8.1, 8.3, 8.4, 8.5 and design.md section
"7. Audit Log do Service tạo".
"""

import uuid

from fastapi import HTTPException, status
from sqlmodel import Session

from app.models.audit_logs_model import AuditAction, AuditLog, EntityType
from app.models.users_model import User
from app.repositories.audit_logs_repository import AuditLogsRepository
from app.repositories.boards_repository import BoardsRepository
from app.services.organization_members_service import OrganizationMemberService


class AuditLogsService:
    """Business logic for the ``audit_logs`` domain (record + scoped queries)."""

    def __init__(
        self,
        repo: AuditLogsRepository | None = None,
        member_service: OrganizationMemberService | None = None,
        boards_repo: BoardsRepository | None = None,
    ) -> None:
        self.repo = repo or AuditLogsRepository()
        self.member_service = member_service or OrganizationMemberService()
        self.boards_repo = boards_repo or BoardsRepository()

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
        """Append an audit row for a successful C/U/D, in the caller's session.

        Builds an ``AuditLog`` capturing what changed (``entity_type`` /
        ``entity_id`` / ``entity_title``), who changed it (``user.id`` /
        ``user.full_name`` falling back to ``user.email`` since ``full_name`` is
        nullable) and the owning ``org_id``, then stages it via the repository.
        Does NOT commit — the originating Board/List/Card service owns the
        transaction and commits once at the end, so the audit row lives or dies
        with the operation (requirements 8.1, 8.2 / 11).

        ``org_id`` is keyword-only and required: an audit row cannot exist
        without it and it is not derivable from ``User``. Callers already hold it
        (``board.org_id``, or resolved via ``card -> list -> board -> org_id``)
        at the point they record. ``action`` / ``entity_type`` accept either the
        enum or its string value; the enum value is stored.
        """
        action_value = action.value if isinstance(action, AuditAction) else action
        entity_type_value = (
            entity_type.value
            if isinstance(entity_type, EntityType)
            else entity_type
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
        """Return an organization's audit log, newest first, paginated.

        Enforces org-scoping: a non-member gets HTTP 403
        ``"Not a member of this organization"`` (requirements 4.1, 8.3). Rows are
        ordered ``created_at`` descending and paged via ``skip`` / ``limit``.
        """
        self.member_service.assert_member(session, org_id, current_user.id)
        return self.repo.list_by_org(session, org_id, skip=skip, limit=limit)

    def list_for_board(
        self,
        session: Session,
        board_id: uuid.UUID,
        current_user: User,
    ) -> list[AuditLog]:
        """Return audit logs for a board (and, eventually, its lists + cards).

        Resolves the owning organization through the board (HTTP 404
        ``"Board not found"`` when absent), asserts the current user is a member
        (HTTP 403 otherwise), then returns the logs for the board's entity ids,
        newest first (requirements 8.4, 4.1, 4.2).

        TODO(14.1/15.1): once ``board_lists_repository`` / ``task_cards_repository``
        are implemented, expand ``entity_ids`` to also include the board's list
        ids and card ids so the board-scoped log covers its descendants
        (requirement 8.4). For now only the board's own entity id is queried.
        """
        board = self.boards_repo.get(session, board_id)
        if board is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Board not found",
            )
        self.member_service.assert_member(session, board.org_id, current_user.id)
        entity_ids: list[uuid.UUID] = [board_id]
        return self.repo.list_by_entities(session, entity_ids)

    def list_for_card(
        self,
        session: Session,
        card_id: uuid.UUID,
        current_user: User,
    ) -> list[AuditLog]:
        """Return audit logs for a single card, newest first (requirement 8.5).

        The ``task_cards`` repository does not exist yet (task 15.1), so the
        owning organization is derived from the card's own audit rows — every row
        for a card shares the same ``org_id``. Membership is asserted against that
        org before any row is returned, so org-scoping still holds (HTTP 403 for
        non-members). A card with no audit rows yields an empty list (nothing to
        authorize or leak).

        TODO(15.1): once ``task_cards_repository`` exists, resolve the org via the
        ``card -> list -> board -> org_id`` chain and assert membership BEFORE
        querying, matching the resolution described in design.md section 4.
        """
        logs = self.repo.list_by_card(session, card_id)
        if not logs:
            return []
        self.member_service.assert_member(
            session, logs[0].org_id, current_user.id
        )
        return logs
