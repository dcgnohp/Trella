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
    """Raise HTTP 403 if the current user is not a member of the organization."""
    logs = _service.list_for_org(session, org_id, current_user, skip=skip, limit=limit)
    return [AuditLogPublic.model_validate(log) for log in logs]


@router.get("/boards/{board_id}/audit-logs", response_model=list[AuditLogPublic])
def list_board_audit_logs(
    session: SessionDep,
    board_id: uuid.UUID,
    current_user: CurrentUser,
) -> list[AuditLogPublic]:
    """Raise HTTP 404 if the board does not exist, HTTP 403 if not a member of the owning organization."""
    logs = _service.list_for_board(session, board_id, current_user)
    return [AuditLogPublic.model_validate(log) for log in logs]


@router.get("/cards/{card_id}/audit-logs", response_model=list[AuditLogPublic])
def list_card_audit_logs(
    session: SessionDep,
    card_id: uuid.UUID,
    current_user: CurrentUser,
) -> list[AuditLogPublic]:
    """Raise HTTP 403 if the current user is not a member of the card's organization."""
    logs = _service.list_for_card(session, card_id, current_user)
    return [AuditLogPublic.model_validate(log) for log in logs]
