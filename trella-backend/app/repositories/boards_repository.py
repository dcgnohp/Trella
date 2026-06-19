import uuid

from sqlmodel import Session, func, select

from app.models.boards_model import Board
from app.models.projects_model import Project


class BoardsRepository:
    def create(self, session: Session, board: Board) -> Board:
        session.add(board)
        session.flush()
        return board

    def get(self, session: Session, board_id: uuid.UUID) -> Board | None:
        """Return the board with the given id, or None if absent."""
        return session.get(Board, board_id)

    def list_by_workspace(
        self, session: Session, workspace_id: uuid.UUID
    ) -> list[Board]:
        statement = (
            select(Board)
            .join(Project, Board.project_id == Project.id)
            .where(Project.workspace_id == workspace_id)
        )
        return list(session.exec(statement).all())

    def workspace_id_for_board(
        self, session: Session, board_id: uuid.UUID
    ) -> uuid.UUID | None:
        """Resolve a board's owning workspace id, or None if unresolved."""
        statement = (
            select(Project.workspace_id)
            .join(Board, Board.project_id == Project.id)
            .where(Board.id == board_id)
        )
        return session.exec(statement).first()

    def update(self, session: Session, board: Board) -> Board:
        session.add(board)
        session.flush()
        return board

    def delete(self, session: Session, board: Board) -> None:
        session.delete(board)
        session.flush()

    def count_by_workspace(self, session: Session, workspace_id: uuid.UUID) -> int:
        statement = (
            select(func.count())
            .select_from(Board)
            .join(Project, Board.project_id == Project.id)
            .where(Project.workspace_id == workspace_id)
        )
        return session.exec(statement).one()
