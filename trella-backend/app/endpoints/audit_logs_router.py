"""audit_logs router layer.

FastAPI ``APIRouter`` for the ``audit_logs`` domain.

Exposes the three read-only audit-log scopes (the global ``/api/v1`` prefix is
added later at ``app/api/main.py`` by task 16.1). Because the scopes live under
different path roots (``/audit-logs``, ``/boards/...``, ``/cards/...``) this
router declares no shared prefix and uses full paths per route:

- ``GET /audit-logs?orgId=...`` (full path ``/api/v1/audit-logs``): an
  organization's audit log, newest first, paginated via ``skip`` / ``limit``.
  Delegates to ``AuditLogsService.list_for_org`` (requirement 8.3).
- ``GET /boards/{board_id}/audit-logs`` (full path
  ``/api/v1/boards/{board_id}/audit-logs``): the audit log scoped to a board.
  Delegates to ``AuditLogsService.list_for_board`` (requirement 8.4).
- ``GET /cards/{card_id}/audit-logs`` (full path
  ``/api/v1/cards/{card_id}/audit-logs``): the audit log scoped to a card.
  Delegates to ``AuditLogsService.list_for_card`` (requirement 8.5).

All endpoints require an authenticated user resolved by ``get_current_user``
(``CurrentUser``) and enforce org-scoping in the service (HTTP 403 for
non-members). Each returns ``list[AuditLogPublic]`` (camelCase). See
requirements 8.3, 8.4, 8.5 and design.md sections "Components and Interfaces" +
"Dependency Injection (deps)".
"""

import uuid

from fastapi import APIRouter, Query

from app.core.deps import CurrentUser, SessionDep
from app.schemas.audit_logs_schema import AuditLogPublic
from app.services.audit_logs_service import AuditLogsService

router = APIRouter(tags=["audit-logs"])

_service = AuditLogsService()


@router.get("/audit-logs", response_model=list[AuditLogPublic])
def list_org_audit_logs(
    session: SessionDep,
    current_user: CurrentUser,
    org_id: uuid.UUID = Query(alias="orgId"),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=100),
) -> list[AuditLogPublic]:
    """List an organization's audit log, newest first, paginated (Req 8.3).

    Requires ``orgId``; enforces org-scoping (HTTP 403 "Not a member of this
    organization" for non-members). Pages via ``skip`` / ``limit``.
    """
    logs = _service.list_for_org(
        session, org_id, current_user, skip=skip, limit=limit
    )
    return [AuditLogPublic.model_validate(log) for log in logs]


@router.get("/boards/{board_id}/audit-logs", response_model=list[AuditLogPublic])
def list_board_audit_logs(
    session: SessionDep,
    board_id: uuid.UUID,
    current_user: CurrentUser,
) -> list[AuditLogPublic]:
    """List a board's audit log, newest first (Req 8.4).

    Returns HTTP 404 when the board does not exist and HTTP 403 when the current
    user is not a member of the owning organization.
    """
    logs = _service.list_for_board(session, board_id, current_user)
    return [AuditLogPublic.model_validate(log) for log in logs]


@router.get("/cards/{card_id}/audit-logs", response_model=list[AuditLogPublic])
def list_card_audit_logs(
    session: SessionDep,
    card_id: uuid.UUID,
    current_user: CurrentUser,
) -> list[AuditLogPublic]:
    """List a card's audit log, newest first (Req 8.5).

    Enforces org-scoping (HTTP 403 for non-members of the card's organization).
    """
    logs = _service.list_for_card(session, card_id, current_user)
    return [AuditLogPublic.model_validate(log) for log in logs]
