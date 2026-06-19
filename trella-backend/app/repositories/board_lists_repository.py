import uuid

from sqlmodel import Session, col, func, select

from app.models.board_lists_model import List

# Sentinel returned by ``max_order`` when a board has no lists yet.
# The service computes a new list's order as ``max_order + 1``, so the first
# list in an empty board receives order 0.
EMPTY_BOARD_ORDER_SENTINEL = -1


class BoardListsRepository:
    def create(self, session: Session, board_list: List) -> List:
        session.add(board_list)
        session.flush()
        return board_list

    def get(self, session: Session, list_id: uuid.UUID) -> List | None:
        """Return the list with the given id, or ``None`` if absent."""
        return session.get(List, list_id)

    def list_by_board(self, session: Session, board_id: uuid.UUID) -> list[List]:
        """Return all lists of a board, ordered by ``order`` ascending."""
        statement = (
            select(List).where(List.board_id == board_id).order_by(col(List.order))
        )
        return list(session.exec(statement).all())

    def get_lists_by_ids(
        self, session: Session, list_ids: list[uuid.UUID]
    ) -> list[List]:
        if not list_ids:
            return []
        statement = select(List).where(List.id.in_(list_ids))  # type: ignore[attr-defined]
        return list(session.exec(statement).all())

    def update(self, session: Session, board_list: List) -> List:
        session.add(board_list)
        session.flush()
        return board_list

    def delete(self, session: Session, board_list: List) -> None:
        session.delete(board_list)
        session.flush()

    def max_order(self, session: Session, board_id: uuid.UUID) -> int:
        """Return the current maximum ``order`` among a board's lists, or ``EMPTY_BOARD_ORDER_SENTINEL`` if none exist."""
        statement = select(func.max(List.order)).where(List.board_id == board_id)
        result = session.exec(statement).one()
        return EMPTY_BOARD_ORDER_SENTINEL if result is None else result

    def update_order(self, session: Session, list_id: uuid.UUID, order: int) -> None:
        """Set the ``order`` of a single list by id and flush. No-op if list id does not exist."""
        board_list = session.get(List, list_id)
        if board_list is None:
            return
        board_list.order = order
        session.add(board_list)
        session.flush()
