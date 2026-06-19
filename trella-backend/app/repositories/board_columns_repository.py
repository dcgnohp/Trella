import uuid

from sqlmodel import Session, col, func, select

from app.models.board_columns_model import BoardColumn

# Returns 0 for an empty board so the service can compute new position as max_position + 1.
EMPTY_BOARD_MAX_POSITION = 0


class BoardColumnsRepository:
    """DB access for the board_columns table. Write methods flush but do not commit."""

    def create(self, session: Session, column: BoardColumn) -> BoardColumn:
        session.add(column)
        session.flush()
        return column

    def get(self, session: Session, column_id: uuid.UUID) -> BoardColumn | None:
        return session.get(BoardColumn, column_id)

    def list_by_board(self, session: Session, board_id: uuid.UUID) -> list[BoardColumn]:
        """Return all columns of a board ordered by position ascending."""
        statement = (
            select(BoardColumn)
            .where(BoardColumn.board_id == board_id)
            .order_by(col(BoardColumn.position))
        )
        return list(session.exec(statement).all())

    def count_by_board(self, session: Session, board_id: uuid.UUID) -> int:
        """Return the number of columns belonging to the given board."""
        statement = (
            select(func.count())
            .select_from(BoardColumn)
            .where(BoardColumn.board_id == board_id)
        )
        return session.exec(statement).one()

    def get_by_ids(self, session: Session, ids: list[uuid.UUID]) -> list[BoardColumn]:
        """Return columns whose ids are in the given list (used by reorder)."""
        if not ids:
            return []
        statement = select(BoardColumn).where(col(BoardColumn.id).in_(ids))
        return list(session.exec(statement).all())

    def update(self, session: Session, column: BoardColumn) -> BoardColumn:
        session.add(column)
        session.flush()
        return column

    def delete(self, session: Session, column: BoardColumn) -> None:
        session.delete(column)
        session.flush()

    def max_position(self, session: Session, board_id: uuid.UUID) -> int:
        """Return the current maximum position among a board's columns, or 0 if none."""
        statement = select(func.max(BoardColumn.position)).where(
            BoardColumn.board_id == board_id
        )
        result = session.exec(statement).one()
        return EMPTY_BOARD_MAX_POSITION if result is None else result

    def update_position(
        self, session: Session, column_id: uuid.UUID, position: int
    ) -> None:
        """Set the position of a single column by id and flush. No-op if id not found."""
        column = session.get(BoardColumn, column_id)
        if column is None:
            return
        column.position = position
        session.add(column)
        session.flush()
