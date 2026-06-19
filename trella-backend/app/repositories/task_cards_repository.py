import uuid

from sqlmodel import Session, col, func, select

from app.models.task_cards_model import Card

# Sentinel returned by ``max_order`` when a list has no cards yet.
# The service computes a new card's order as ``max_order + 1``;
# with this sentinel the first card in an empty list receives order 0.
EMPTY_LIST_ORDER_SENTINEL = -1


class TaskCardsRepository:
    def create(self, session: Session, card: Card) -> Card:
        if card.board_id is None or card.project_id is None:
            from app.models.board_columns_model import BoardColumn
            from app.models.boards_model import Board

            column = session.get(BoardColumn, card.list_id)
            if column:
                card.board_id = column.board_id
                board = session.get(Board, column.board_id)
                if board:
                    card.project_id = board.project_id
        session.add(card)
        session.flush()
        return card

    def get(self, session: Session, card_id: uuid.UUID) -> Card | None:
        return session.get(Card, card_id)

    def list_by_list(self, session: Session, list_id: uuid.UUID) -> list[Card]:
        """Return all cards of a list, ordered by ``order`` ascending."""
        statement = (
            select(Card).where(Card.list_id == list_id).order_by(col(Card.order))
        )
        return list(session.exec(statement).all())

    def get_cards_by_ids(
        self, session: Session, card_ids: list[uuid.UUID]
    ) -> list[Card]:
        if not card_ids:
            return []
        statement = select(Card).where(Card.id.in_(card_ids))  # type: ignore[attr-defined]
        return list(session.exec(statement).all())

    def update(self, session: Session, card: Card) -> Card:
        session.add(card)
        session.flush()
        return card

    def delete(self, session: Session, card: Card) -> None:
        session.delete(card)
        session.flush()

    def max_order(self, session: Session, list_id: uuid.UUID) -> int:
        """Return the current maximum ``order`` among a list's cards, or EMPTY_LIST_ORDER_SENTINEL if none."""
        statement = select(func.max(Card.order)).where(Card.list_id == list_id)
        result = session.exec(statement).one()
        return EMPTY_LIST_ORDER_SENTINEL if result is None else result

    def update_order_and_list(
        self,
        session: Session,
        card_id: uuid.UUID,
        order: int,
        list_id: uuid.UUID,
    ) -> None:
        """Set ``order`` and ``list_id`` for a card and flush. No-op if card does not exist."""
        card = session.get(Card, card_id)
        if card is None:
            return
        card.order = order
        card.list_id = list_id
        if list_id:
            from app.models.board_columns_model import BoardColumn
            from app.models.boards_model import Board

            column = session.get(BoardColumn, list_id)
            if column:
                card.board_id = column.board_id
                board = session.get(Board, column.board_id)
                if board:
                    card.project_id = board.project_id
        session.add(card)
        session.flush()
