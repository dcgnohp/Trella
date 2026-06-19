import base64
import binascii
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core.deps import (
    CurrentUser,
    SessionDep,
    require_project_permission,
    resolve_scope,
)
from app.core.rbac import Action
from app.repositories.activity_logs_repository import (
    DEFAULT_LIMIT,
    MAX_LIMIT,
    Cursor,
)
from app.schemas.activity_logs_schema import ActivityLogPublic
from app.services.activity_logs_service import ActivityLogsService

router = APIRouter(tags=["activity-logs"])

_service = ActivityLogsService()


def _encode_cursor(log: ActivityLogPublic) -> str:
    """Encode (created_at, id) into an opaque URL-safe base64 cursor token."""
    raw = f"{log.created_at.isoformat()}|{log.id}"
    return base64.urlsafe_b64encode(raw.encode("utf-8")).decode("ascii")


def _decode_cursor(cursor: str | None) -> Cursor | None:
    """Decode a cursor token back into (created_at, id). Raises HTTP 400 on invalid input."""
    if cursor is None:
        return None
    try:
        raw = base64.urlsafe_b64decode(cursor.encode("ascii")).decode("utf-8")
        created_at_str, id_str = raw.split("|", 1)
        return datetime.fromisoformat(created_at_str), uuid.UUID(id_str)
    except (binascii.Error, UnicodeDecodeError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid cursor",
        )


@router.get("/tasks/{task_id}/activity", response_model=list[ActivityLogPublic])
def list_task_activity(
    session: SessionDep,
    task_id: uuid.UUID,
    current_user: CurrentUser,
    limit: int = Query(default=DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
    cursor: str | None = Query(default=None),
) -> list[ActivityLogPublic]:
    """List a single task's activity timeline, newest first. Raises HTTP 404 if task not found."""
    from app.models.tasks_model import Task

    task = session.get(Task, task_id)
    if task is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found",
        )
    scope = resolve_scope(session, task)
    logs = _service.list_for_task(
        session,
        task_id,
        current_user,
        limit=limit,
        cursor=_decode_cursor(cursor),
        project_id=scope.project_id,
    )
    return [ActivityLogPublic.model_validate(log) for log in logs]


@router.get(
    "/projects/{project_id}/activity",
    response_model=list[ActivityLogPublic],
    dependencies=[Depends(require_project_permission(Action.VIEW_PROJECT_RESOURCE))],
)
def list_project_activity(
    session: SessionDep,
    project_id: uuid.UUID,
    current_user: CurrentUser,
    limit: int = Query(default=DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
    cursor: str | None = Query(default=None),
) -> list[ActivityLogPublic]:
    """List a whole project's activity timeline, newest first. Raises HTTP 403 if not a member."""
    logs = _service.list_for_project(
        session,
        project_id,
        current_user,
        limit=limit,
        cursor=_decode_cursor(cursor),
    )
    return [ActivityLogPublic.model_validate(log) for log in logs]
