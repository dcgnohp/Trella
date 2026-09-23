import base64
import binascii
import uuid
from datetime import datetime

from fastapi import APIRouter, HTTPException, Query, status

from app.core.deps import CurrentUser, SessionDep
from app.models.comments_model import Comment
from app.repositories.comments_repository import (
    DEFAULT_LIMIT,
    MAX_LIMIT,
    Cursor,
)
from app.schemas.comments_schema import (
    CommentCreate,
    CommentPublic,
    CommentUpdate,
)
from app.services.attribution import resolve_actor
from app.services.comments_service import CommentsService

router = APIRouter(tags=["comments"])

_service = CommentsService()


def _to_public(session: SessionDep, comment: Comment) -> CommentPublic:
    return CommentPublic(
        id=comment.id,
        task_id=comment.task_id,
        user_id=comment.user_id,
        content=comment.content,
        created_at=comment.created_at,
        updated_at=comment.updated_at,
        author=resolve_actor(session, comment.user_id),
    )


def _encode_cursor(comment: CommentPublic) -> str:
    """Encode (created_at, id) into an opaque URL-safe base64 cursor token."""
    raw = f"{comment.created_at.isoformat()}|{comment.id}"
    return base64.urlsafe_b64encode(raw.encode("utf-8")).decode("ascii")


def _decode_cursor(cursor: str | None) -> Cursor | None:
    """Decode a cursor token; raises HTTP 400 if malformed."""
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


@router.post(
    "/tasks/{task_id}/comments",
    response_model=CommentPublic,
    status_code=status.HTTP_201_CREATED,
)
def create_comment(
    session: SessionDep,
    task_id: uuid.UUID,
    data: CommentCreate,
    current_user: CurrentUser,
) -> CommentPublic:
    comment = _service.create_comment(session, task_id, data, current_user)
    return _to_public(session, comment)


@router.get("/tasks/{task_id}/comments", response_model=list[CommentPublic])
def list_comments(
    session: SessionDep,
    task_id: uuid.UUID,
    current_user: CurrentUser,
    limit: int = Query(default=DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
    cursor: str | None = Query(default=None),
) -> list[CommentPublic]:
    return _service.list_comments(
        session,
        task_id,
        current_user,
        limit=limit,
        cursor=_decode_cursor(cursor),
    )


@router.patch("/comments/{comment_id}", response_model=CommentPublic)
def update_comment(
    session: SessionDep,
    comment_id: uuid.UUID,
    data: CommentUpdate,
    current_user: CurrentUser,
) -> CommentPublic:
    comment = _service.update_comment(session, comment_id, data, current_user)
    return _to_public(session, comment)


@router.delete("/comments/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_comment(
    session: SessionDep,
    comment_id: uuid.UUID,
    current_user: CurrentUser,
) -> None:
    _service.delete_comment(session, comment_id, current_user)
