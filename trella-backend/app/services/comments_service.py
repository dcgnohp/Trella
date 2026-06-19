import uuid

from fastapi import HTTPException, status
from sqlmodel import Session

from app.core.base import utcnow
from app.core.deps import ResolvedScope, resolve_scope
from app.core.rbac import Action, RBACService
from app.models.comment_mentions_model import CommentMention
from app.models.comments_model import Comment
from app.models.enums import ActivityAction, NotificationType
from app.models.users_model import User
from app.repositories.comment_mentions_repository import CommentMentionsRepository
from app.repositories.comments_repository import (
    DEFAULT_LIMIT,
    CommentsRepository,
    Cursor,
)
from app.repositories.project_members_repository import ProjectMembersRepository
from app.schemas.comments_schema import (
    CommentCreate,
    CommentPublic,
    CommentUpdate,
)
from app.services.activity_logs_service import ActivityLogsService
from app.services.attribution import resolve_actor
from app.services.mention_parser import extract_mentions

MAX_CONTENT_LENGTH = 5000


class CommentsService:
    def __init__(
        self,
        repo: CommentsRepository | None = None,
        rbac_service: RBACService | None = None,
        activity_logs_service: ActivityLogsService | None = None,
        comment_mentions_repo: CommentMentionsRepository | None = None,
        project_members_repo: ProjectMembersRepository | None = None,
    ) -> None:
        self.repo = repo or CommentsRepository()
        self.rbac_service = rbac_service or RBACService()
        self.activity_logs_service = activity_logs_service or ActivityLogsService()
        self.comment_mentions_repo = (
            comment_mentions_repo or CommentMentionsRepository()
        )
        self.project_members_repo = project_members_repo or ProjectMembersRepository()

    def create_comment(
        self,
        session: Session,
        task_id: uuid.UUID,
        data: CommentCreate,
        user: User,
    ) -> Comment:
        task = self._load_task(session, task_id)
        scope = resolve_scope(session, task)
        self.rbac_service.check(
            session,
            Action.MANAGE_OWN_COMMENT,
            user=user,
            project_id=scope.project_id,
        )
        self._validate_content(data.content)

        comment = Comment(
            task_id=task_id,
            user_id=user.id,
            content=data.content,
        )
        self.repo.create(session, comment)
        session.commit()
        session.refresh(comment)

        self._record_best_effort(
            session, scope, task_id, user, ActivityAction.COMMENT_CREATED
        )
        self._process_mentions(session, comment, scope)
        return comment

    def list_comments(
        self,
        session: Session,
        task_id: uuid.UUID,
        user: User,
        *,
        limit: int = DEFAULT_LIMIT,
        cursor: Cursor | None = None,
    ) -> list[CommentPublic]:
        task = self._load_task(session, task_id)
        scope = resolve_scope(session, task)
        self.rbac_service.check(
            session,
            Action.VIEW_PROJECT_RESOURCE,
            user=user,
            project_id=scope.project_id,
        )
        comments = self.repo.list_by_task(session, task_id, limit=limit, cursor=cursor)
        return [self._to_public(session, comment) for comment in comments]

    def update_comment(
        self,
        session: Session,
        comment_id: uuid.UUID,
        data: CommentUpdate,
        user: User,
    ) -> Comment:
        comment = self._load_comment(session, comment_id)
        scope = resolve_scope(session, comment)
        self._check_manage(session, comment, user)
        self._validate_content(data.content)

        comment.content = data.content
        comment.updated_at = utcnow()
        self.repo.update(session, comment)
        session.commit()
        session.refresh(comment)

        self._record_best_effort(
            session, scope, comment.task_id, user, ActivityAction.COMMENT_UPDATED
        )
        self._process_mentions(session, comment, scope)
        return comment

    def delete_comment(
        self,
        session: Session,
        comment_id: uuid.UUID,
        user: User,
    ) -> None:
        comment = self._load_comment(session, comment_id)
        scope = resolve_scope(session, comment)
        self._check_manage(session, comment, user)

        task_id = comment.task_id
        self.repo.delete(session, comment)
        session.commit()

        self._record_best_effort(
            session, scope, task_id, user, ActivityAction.COMMENT_DELETED
        )

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _load_task(self, session: Session, task_id: uuid.UUID) -> object:
        """Raise HTTP 404 if the Task does not exist."""
        from app.models.tasks_model import Task

        task = session.get(Task, task_id)
        if task is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Task not found",
            )
        return task

    def _load_comment(self, session: Session, comment_id: uuid.UUID) -> Comment:
        """Raise HTTP 404 if the Comment does not exist."""
        comment = self.repo.get(session, comment_id)
        if comment is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Comment not found",
            )
        return comment

    def _check_manage(self, session: Session, comment: Comment, user: User) -> None:
        """Raise HTTP 403 if the user is neither the author nor a PROJECT_ADMIN."""
        scope = resolve_scope(session, comment)
        action = (
            Action.MANAGE_OWN_COMMENT
            if comment.user_id == user.id
            else Action.MANAGE_OTHERS_COMMENT
        )
        self.rbac_service.check(session, action, user=user, project_id=scope.project_id)

    @staticmethod
    def _validate_content(content: str) -> None:
        """Raise HTTP 422 for empty or over-length comment content."""
        if not content.strip():
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Comment content cannot be empty",
            )
        if len(content) > MAX_CONTENT_LENGTH:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Comment content exceeds 5000 characters",
            )

    def _record_best_effort(
        self,
        session: Session,
        scope: ResolvedScope,
        task_id: uuid.UUID,
        actor: User,
        action: ActivityAction,
    ) -> None:
        if scope.project_id is None or scope.workspace_id is None:
            return
        self.activity_logs_service.record_best_effort(
            session,
            workspace_id=scope.workspace_id,
            project_id=scope.project_id,
            task_id=task_id,
            actor=actor,
            action=action,
        )

    def _to_public(self, session: Session, comment: Comment) -> CommentPublic:
        return CommentPublic(
            id=comment.id,
            task_id=comment.task_id,
            user_id=comment.user_id,
            content=comment.content,
            created_at=comment.created_at,
            updated_at=comment.updated_at,
            author=resolve_actor(session, comment.user_id),
        )

    def _process_mentions(
        self, session: Session, comment: Comment, scope: ResolvedScope
    ) -> None:
        if scope.project_id is None:
            return

        names = extract_mentions(comment.content)
        if not names:
            return

        # Delete existing mentions before reinserting (handles edits).
        self.comment_mentions_repo.delete_by_comment(session, comment.id)

        from app.services.notifications_service import NotificationService

        notif_service = NotificationService()
        for name in names:
            mentioned_user = self.project_members_repo.get_active_by_name(
                session, scope.project_id, name
            )
            if mentioned_user is None or mentioned_user.id == comment.user_id:
                continue
            try:
                self.comment_mentions_repo.create_bulk(
                    session,
                    [
                        CommentMention(
                            comment_id=comment.id, mentioned_user_id=mentioned_user.id
                        )
                    ],
                )
                session.commit()
                notif_service.emit(
                    session,
                    recipient_id=mentioned_user.id,
                    type=NotificationType.COMMENT_MENTION,
                    title="You were mentioned in a comment",
                    metadata={
                        "task_id": str(comment.task_id),
                        "comment_id": str(comment.id),
                        "project_id": str(scope.project_id),
                    },
                )
                session.commit()
            except Exception:
                session.rollback()
