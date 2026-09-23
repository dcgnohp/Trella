import uuid

from fastapi import APIRouter, File, UploadFile, status

from app.core.deps import CurrentUser, SessionDep
from app.schemas.attachments_schema import AttachmentPublic
from app.services.attachments_service import AttachmentsService

router = APIRouter(tags=["attachments"])

_service = AttachmentsService()


@router.post(
    "/tasks/{task_id}/attachments",
    response_model=AttachmentPublic,
    status_code=status.HTTP_201_CREATED,
)
def upload_attachment(
    session: SessionDep,
    task_id: uuid.UUID,
    current_user: CurrentUser,
    file: UploadFile = File(...),
) -> AttachmentPublic:
    """Upload a file against a Task, returning HTTP 201."""
    attachment = _service.upload_attachment(session, task_id, file, current_user)
    return _service.to_public(session, attachment)


@router.get(
    "/tasks/{task_id}/attachments",
    response_model=list[AttachmentPublic],
)
def list_attachments(
    session: SessionDep,
    task_id: uuid.UUID,
    current_user: CurrentUser,
) -> list[AttachmentPublic]:
    """List a Task's attachments newest-first."""
    return _service.list_attachments(session, task_id, current_user)


@router.get("/attachments/{attachment_id}/download-url")
def get_attachment_download_url(
    session: SessionDep,
    attachment_id: uuid.UUID,
    current_user: CurrentUser,
) -> dict[str, str]:
    """Return a short-lived signed download URL for an attachment."""
    url = _service.get_download_url(session, attachment_id, current_user)
    return {"url": url}


@router.delete(
    "/attachments/{attachment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_attachment(
    session: SessionDep,
    attachment_id: uuid.UUID,
    current_user: CurrentUser,
) -> None:
    """Delete an attachment, returning HTTP 204."""
    _service.delete_attachment(session, attachment_id, current_user)
