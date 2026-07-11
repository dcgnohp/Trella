import logging
import uuid
from typing import Any

from fastapi import HTTPException, UploadFile, status
from sqlmodel import Session

from app.core.deps import resolve_scope
from app.core.rbac import Action, RBACService
from app.core.storage import (
    DEFAULT_SIGNED_URL_TTL_SECONDS,
    StorageService,
    build_storage_key,
    get_storage_service,
)
from app.models.attachments_model import Attachment
from app.models.enums import ActivityAction
from app.models.users_model import User
from app.repositories.attachments_repository import AttachmentsRepository
from app.schemas.attachments_schema import AttachmentPublic
from app.schemas.shared import AuthorPublic
from app.services.activity_logs_service import ActivityLogsService
from app.services.attribution import resolve_actor

logger = logging.getLogger(__name__)

# Maximum accepted upload size: 25 MiB.
MAX_ATTACHMENT_SIZE_BYTES = 25 * 1024 * 1024  # 26214400

# Executables / scripts rejected with HTTP 415 before any bytes are stored.
FORBIDDEN_MIME_TYPES: frozenset[str] = frozenset(
    {
        "application/x-msdownload",
        "application/x-sh",
        "application/x-bat",
        "application/x-msdos-program",
    }
)


class AttachmentsService:
    def __init__(
        self,
        storage: StorageService | None = None,
        repo: AttachmentsRepository | None = None,
        activity_service: ActivityLogsService | None = None,
        rbac_service: RBACService | None = None,
    ) -> None:
        self.storage = storage or get_storage_service()
        self.repo = repo or AttachmentsRepository()
        self.activity_service = activity_service or ActivityLogsService()
        self.rbac_service = rbac_service or RBACService()

    def _resolve_task_scope(
        self, session: Session, task_id: uuid.UUID
    ) -> tuple[uuid.UUID, uuid.UUID]:
        """Return (project_id, workspace_id) for a Task, or raise HTTP 404."""
        from app.models.tasks_model import Task

        task = session.get(Task, task_id)
        if task is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Task not found",
            )
        scope = resolve_scope(session, task)
        if scope.project_id is None or scope.workspace_id is None:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Task is not linked to a project/workspace",
            )
        return scope.project_id, scope.workspace_id

    @staticmethod
    def _upload_size(upload: UploadFile) -> int:
        """Return upload size in bytes without consuming the file."""
        if upload.size is not None:
            return upload.size
        fileobj = upload.file
        fileobj.seek(0, 2)  # SEEK_END
        size = fileobj.tell()
        fileobj.seek(0)
        return size

    def upload_attachment(
        self,
        session: Session,
        task_id: uuid.UUID,
        upload: UploadFile,
        user: User,
    ) -> Attachment:
        """Upload a file against a Task, atomically with its activity log."""
        project_id, workspace_id = self._resolve_task_scope(session, task_id)
        self.rbac_service.check(
            session,
            Action.MANAGE_OWN_ATTACHMENT,
            user=user,
            project_id=project_id,
        )

        size_bytes = self._upload_size(upload)
        if size_bytes > MAX_ATTACHMENT_SIZE_BYTES:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail="File exceeds 25 MiB size limit",
            )
        mime_type = upload.content_type or "application/octet-stream"
        if mime_type in FORBIDDEN_MIME_TYPES:
            raise HTTPException(
                status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                detail="File type is not allowed",
            )

        file_name = upload.filename or "file"
        storage_key = build_storage_key(task_id, file_name)
        self.storage.save(key=storage_key, fileobj=upload.file, content_type=mime_type)

        try:
            # Check if file is a document format and auto-create a Doc
            lower_name = file_name.lower()
            if lower_name.endswith(('.md', '.txt', '.html')):
                try:
                    upload.file.seek(0)
                    file_content_bytes = upload.file.read()
                    upload.file.seek(0)  # reset pointer for downstream
                    
                    file_content = file_content_bytes.decode('utf-8', errors='ignore')
                    
                    from sqlmodel import select
                    from app.models.docs_model import Doc
                    from app.models.knowledge_collections_model import KnowledgeCollection
                    from app.models.tasks_model import Task as DBTask
                    
                    col = session.exec(
                        select(KnowledgeCollection)
                        .where(KnowledgeCollection.workspace_id == workspace_id)
                        .order_by(KnowledgeCollection.position)
                    ).first()
                    col_id = col.id if col else None
                    
                    task = session.get(DBTask, task_id)
                    board_id = task.board_id if task else None
                    sprint_id = task.sprint_id if task else None
                    
                    formatted_content = file_content
                    if lower_name.endswith('.txt'):
                        paragraphs = file_content.split('\n\n')
                        formatted_content = "".join(f"<p>{p.strip().replace('\n', '<br/>')}</p>" for p in paragraphs if p.strip())
                    elif lower_name.endswith('.md'):
                        # Simple markdown parse
                        import re
                        lines = file_content.split('\n')
                        parsed_lines = []
                        for line in lines:
                            line = line.strip()
                            if line.startswith('### '):
                                parsed_lines.append(f"<h3>{line[4:]}</h3>")
                            elif line.startswith('## '):
                                parsed_lines.append(f"<h2>{line[3:]}</h2>")
                            elif line.startswith('# '):
                                parsed_lines.append(f"<h1>{line[2:]}</h1>")
                            elif line.startswith('- '):
                                parsed_lines.append(f"<li>{line[2:]}</li>")
                            elif line.startswith('* '):
                                parsed_lines.append(f"<li>{line[2:]}</li>")
                            else:
                                parsed_lines.append(line)
                        formatted_content = "\n".join(parsed_lines)
                        paragraphs = formatted_content.split('\n\n')
                        formatted_content = "".join(
                            p if p.startswith('<h') or p.startswith('<li') else f"<p>{p.replace('\n', '<br/>')}</p>"
                            for p in paragraphs if p.strip()
                        )
                    
                    new_doc = Doc(
                        workspace_id=workspace_id,
                        task_id=task_id,
                        board_id=board_id,
                        sprint_id=sprint_id,
                        title=file_name.rsplit('.', 1)[0],
                        content=formatted_content,
                        created_by=user.id,
                        source_type="TASK",
                        category="Architecture" if lower_name.endswith('.md') else "Development",
                        collection_id=col_id,
                    )
                    session.add(new_doc)
                except Exception as e:
                    logger.error(f"Failed to auto-create doc from uploaded attachment: {e}")

            attachment = self.repo.create(
                session,
                Attachment(
                    task_id=task_id,
                    uploader_id=user.id,
                    file_name=file_name,
                    mime_type=mime_type,
                    size_bytes=size_bytes,
                    storage_key=storage_key,
                ),
            )
            self.activity_service.record(
                session,
                workspace_id=workspace_id,
                project_id=project_id,
                task_id=task_id,
                actor=user,
                action=ActivityAction.ATTACHMENT_UPLOADED,
                new_value={"file_name": file_name, "size_bytes": size_bytes},
            )
            session.commit()
        except Exception:
            session.rollback()
            # Bytes were already written; reclaim best-effort to avoid orphaned objects.
            self._best_effort_storage_delete(storage_key)
            raise
        session.refresh(attachment)
        try:
            from app.core.realtime import ws_manager

            ws_manager.push_to_project(
                project_id,
                "attachment.uploaded",
                {"task_id": str(task_id)},
            )
        except Exception:  # noqa: BLE001 — never fail the caller on a push.
            pass
        return attachment

    def list_attachments(
        self,
        session: Session,
        task_id: uuid.UUID,
        user: User,
    ) -> list[AttachmentPublic]:
        """List a Task's attachments newest-first, with resolved uploaders."""
        project_id, _ = self._resolve_task_scope(session, task_id)
        self.rbac_service.check(
            session,
            Action.VIEW_PROJECT_RESOURCE,
            user=user,
            project_id=project_id,
        )
        attachments = self.repo.list_by_task(session, task_id)
        return [self.to_public(session, attachment) for attachment in attachments]

    def get_download_url(
        self,
        session: Session,
        attachment_id: uuid.UUID,
        user: User,
    ) -> str:
        """Return a short-lived signed download URL for an attachment."""
        attachment = self._get_attachment_or_404(session, attachment_id)
        project_id, _ = self._resolve_task_scope(session, attachment.task_id)
        self.rbac_service.check(
            session,
            Action.VIEW_PROJECT_RESOURCE,
            user=user,
            project_id=project_id,
        )
        return self.storage.signed_url(
            key=attachment.storage_key,
            ttl_seconds=DEFAULT_SIGNED_URL_TTL_SECONDS,
        )

    def delete_attachment(
        self,
        session: Session,
        attachment_id: uuid.UUID,
        user: User,
    ) -> None:
        """Delete an attachment row and activity log, then reclaim bytes best-effort."""
        attachment = self._get_attachment_or_404(session, attachment_id)
        project_id, workspace_id = self._resolve_task_scope(session, attachment.task_id)
        # Uploader may delete their own; otherwise PROJECT_ADMIN required.
        required_action = (
            Action.MANAGE_OWN_ATTACHMENT
            if attachment.uploader_id == user.id
            else Action.DELETE_OTHERS_ATTACHMENT
        )
        self.rbac_service.check(
            session,
            required_action,
            user=user,
            project_id=project_id,
        )

        storage_key = attachment.storage_key
        task_id = attachment.task_id
        old_value = self._snapshot(attachment)
        try:
            self.activity_service.record(
                session,
                workspace_id=workspace_id,
                project_id=project_id,
                task_id=task_id,
                actor=user,
                action=ActivityAction.ATTACHMENT_DELETED,
                old_value=old_value,
            )
            self.repo.delete(session, attachment)
            session.commit()
        except Exception:
            session.rollback()
            raise

        # Row is durably gone; reclaim bytes best-effort — storage failure must not
        # turn a successful delete into an error.
        self._best_effort_storage_delete(storage_key)

    # ------------------------------------------------------------------ helpers
    def _get_attachment_or_404(
        self, session: Session, attachment_id: uuid.UUID
    ) -> Attachment:
        """Fetch an attachment or raise HTTP 404."""
        attachment = self.repo.get(session, attachment_id)
        if attachment is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Attachment not found",
            )
        return attachment

    def to_public(self, session: Session, attachment: Attachment) -> AttachmentPublic:
        """Map an Attachment row to its public schema with resolved uploader."""
        uploader: AuthorPublic = resolve_actor(session, attachment.uploader_id)
        return AttachmentPublic(
            id=attachment.id,
            task_id=attachment.task_id,
            uploader_id=attachment.uploader_id,
            file_name=attachment.file_name,
            mime_type=attachment.mime_type,
            size_bytes=attachment.size_bytes,
            created_at=attachment.created_at,
            updated_at=attachment.updated_at,
            uploader=uploader,
        )

    @staticmethod
    def _snapshot(attachment: Attachment) -> dict[str, Any]:
        """Return a JSON-serializable snapshot for an ATTACHMENT_DELETED log."""
        return {
            "id": str(attachment.id),
            "task_id": str(attachment.task_id),
            "uploader_id": str(attachment.uploader_id),
            "file_name": attachment.file_name,
            "mime_type": attachment.mime_type,
            "size_bytes": attachment.size_bytes,
        }

    def _best_effort_storage_delete(self, storage_key: str) -> None:
        """Delete stored bytes, swallowing any failure (logged for cleanup)."""
        try:
            self.storage.delete(key=storage_key)
        except Exception:  # noqa: BLE001 — best-effort: swallow every failure.
            logger.warning(
                "Best-effort storage delete failed (storage_key=%s); the "
                "object is orphaned and will be reclaimed by a later cleanup.",
                storage_key,
                exc_info=True,
            )
