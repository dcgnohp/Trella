import uuid
from collections.abc import Sequence
from typing import Any, Protocol, runtime_checkable

from fastapi import HTTPException, status
from sqlmodel import Session

from app.core.rbac import Action, RBACService
from app.models.board_columns_model import BoardColumn
from app.models.enums import ActivityAction
from app.models.users_model import User
from app.repositories.board_columns_repository import BoardColumnsRepository
from app.repositories.boards_repository import BoardsRepository
from app.repositories.projects_repository import ProjectsRepository
from app.services.activity_logs_service import ActivityLogsService


@runtime_checkable
class ColumnCreateData(Protocol):
    name: str
    status_key: str
    position: int | None


class ColumnUpdateData(Protocol):
    def model_dump(self, *, exclude_unset: bool = ...) -> dict[str, Any]: ...


class ColumnReorderItemData(Protocol):
    id: uuid.UUID
    position: int


class BoardColumnsService:
    def __init__(
        self,
        repo: BoardColumnsRepository | None = None,
        boards_repo: BoardsRepository | None = None,
        projects_repo: ProjectsRepository | None = None,
        activity_service: ActivityLogsService | None = None,
        rbac_service: RBACService | None = None,
    ) -> None:
        self.repo = repo or BoardColumnsRepository()
        self.boards_repo = boards_repo or BoardsRepository()
        self.projects_repo = projects_repo or ProjectsRepository()
        self.activity_service = activity_service or ActivityLogsService()
        self.rbac_service = rbac_service or RBACService()

    def _resolve_board_scope(
        self, session: Session, board_id: uuid.UUID
    ) -> tuple[uuid.UUID, uuid.UUID]:
        """Return (project_id, workspace_id) for a board, raising HTTP 404/500 on missing linkage."""
        board = self.boards_repo.get(session, board_id)
        if board is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Board not found",
            )
        project_id: uuid.UUID | None = getattr(board, "project_id", None)
        if project_id is None:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Board is not linked to a project (requires migration 0004)",
            )
        project = self.projects_repo.get(session, project_id)
        if project is None:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Owning project for board not found",
            )
        return project_id, project.workspace_id

    @staticmethod
    def _snapshot(column: BoardColumn) -> dict[str, Any]:
        return {
            "id": str(column.id),
            "board_id": str(column.board_id),
            "name": column.name,
            "status_key": column.status_key,
            "position": column.position,
        }

    def _get_column_in_board(
        self, session: Session, board_id: uuid.UUID, column_id: uuid.UUID
    ) -> BoardColumn:
        """Raise HTTP 404 if column is absent or belongs to a different board."""
        column = self.repo.get(session, column_id)
        if column is None or column.board_id != board_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Column not found",
            )
        return column

    def create_column(
        self,
        session: Session,
        board_id: uuid.UUID,
        data: ColumnCreateData,
        user: User,
    ) -> BoardColumn:
        project_id, workspace_id = self._resolve_board_scope(session, board_id)
        self.rbac_service.check(
            session,
            Action.MANAGE_BOARD_COLUMN,
            user=user,
            project_id=project_id,
        )
        position = (
            data.position
            if data.position is not None
            else self.repo.max_position(session, board_id) + 1
        )
        try:
            column = self.repo.create(
                session,
                BoardColumn(
                    board_id=board_id,
                    name=data.name,
                    status_key=data.status_key,
                    position=position,
                ),
            )
            self.activity_service.record(
                session,
                workspace_id=workspace_id,
                project_id=project_id,
                actor=user,
                action=ActivityAction.COLUMN_CREATED,
                new_value=self._snapshot(column),
            )
            session.commit()
        except Exception:
            session.rollback()
            raise
        session.refresh(column)
        return column

    def update_column(
        self,
        session: Session,
        board_id: uuid.UUID,
        column_id: uuid.UUID,
        data: ColumnUpdateData,
        user: User,
    ) -> BoardColumn:
        project_id, workspace_id = self._resolve_board_scope(session, board_id)
        self.rbac_service.check(
            session,
            Action.MANAGE_BOARD_COLUMN,
            user=user,
            project_id=project_id,
        )
        column = self._get_column_in_board(session, board_id, column_id)
        old_value = self._snapshot(column)
        updates = data.model_dump(exclude_unset=True)
        for field, value in updates.items():
            setattr(column, field, value)
        try:
            column = self.repo.update(session, column)
            self.activity_service.record(
                session,
                workspace_id=workspace_id,
                project_id=project_id,
                actor=user,
                action=ActivityAction.COLUMN_UPDATED,
                old_value=old_value,
                new_value=self._snapshot(column),
            )
            session.commit()
        except Exception:
            session.rollback()
            raise
        session.refresh(column)
        return column

    def delete_column(
        self,
        session: Session,
        board_id: uuid.UUID,
        column_id: uuid.UUID,
        user: User,
    ) -> None:
        """Raise HTTP 409 if the column is the last one on the board."""
        project_id, workspace_id = self._resolve_board_scope(session, board_id)
        self.rbac_service.check(
            session,
            Action.MANAGE_BOARD_COLUMN,
            user=user,
            project_id=project_id,
        )
        column = self._get_column_in_board(session, board_id, column_id)
        if self.repo.count_by_board(session, board_id) <= 1:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Cannot delete the last column of a board",
            )
        old_value = self._snapshot(column)
        try:
            self.activity_service.record(
                session,
                workspace_id=workspace_id,
                project_id=project_id,
                actor=user,
                action=ActivityAction.COLUMN_DELETED,
                old_value=old_value,
            )
            self.repo.delete(session, column)
            session.commit()
        except Exception:
            session.rollback()
            raise

    def reorder_columns(
        self,
        session: Session,
        board_id: uuid.UUID,
        items: Sequence[ColumnReorderItemData],
        user: User,
    ) -> list[BoardColumn]:
        """Raise HTTP 400 if any item id is unknown, duplicated, or belongs to a different board."""
        project_id, workspace_id = self._resolve_board_scope(session, board_id)
        self.rbac_service.check(
            session,
            Action.MANAGE_BOARD_COLUMN,
            user=user,
            project_id=project_id,
        )

        ids = [item.id for item in items]
        rows = self.repo.get_by_ids(session, ids)
        if len(rows) != len(ids) or any(row.board_id != board_id for row in rows):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid reorder payload",
            )

        old_positions = {str(row.id): row.position for row in rows}
        new_positions = {str(item.id): item.position for item in items}
        try:
            for item in items:
                self.repo.update_position(session, item.id, item.position)
            self.activity_service.record(
                session,
                workspace_id=workspace_id,
                project_id=project_id,
                actor=user,
                action=ActivityAction.COLUMN_REORDERED,
                old_value={"positions": old_positions},
                new_value={"positions": new_positions},
            )
            session.commit()
        except Exception:
            session.rollback()
            raise
        return self.repo.list_by_board(session, board_id)
