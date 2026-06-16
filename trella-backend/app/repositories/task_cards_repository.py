"""task_cards repository layer.

Repository (DB access) for the ``task_cards`` domain.

This is the ONLY place that issues SQLModel queries for the ``Card`` model. Per
the design (``design.md`` -> "Repository interface"), every method receives the
``Session`` from the caller (the service) so the repository participates in the
service-owned transaction. Write methods never commit — the service decides when
to ``commit()`` / ``rollback()`` (critical for the atomic reorder/copy flows,
Req 7.4 / 7.6 / Req 11). Read methods are free to query directly.

Mirrors ``board_lists_repository`` (same patterns: explicit session, no
self-commit on writes, ``max_order`` sentinel). The card reorder flow can move a
card to a different list, so this repository also exposes
``update_order_and_list`` which sets both ``order`` and ``list_id`` (Req 7.4).

See requirements 7.1, 7.7.
"""

import uuid

from sqlmodel import Session, col, func, select

from app.models.task_cards_model import Card

# Sentinel returned by ``max_order`` when a list has no cards yet. The service
# computes a new card's order as ``max_order + 1``; with this sentinel the first
# card in an empty list receives order 0.
EMPTY_LIST_ORDER_SENTINEL = -1


class TaskCardsRepository:
    """DB access for the ``cards`` table.

    All methods take an explicit ``session``; write methods (``create``,
    ``update``, ``delete``, ``update_order_and_list``) avoid committing so
    callers can compose several operations inside one transaction.
    """

    def create(self, session: Session, card: Card) -> Card:
        """Stage a new ``Card`` for insertion.

        Adds the instance to the session and flushes so database-generated state
        (e.g. the primary key) is populated, but does NOT commit — the service
        owns the transaction and is responsible for committing.
        """
        session.add(card)
        session.flush()
        return card

    def get(self, session: Session, card_id: uuid.UUID) -> Card | None:
        """Return the card with the given id, or ``None`` if absent."""
        return session.get(Card, card_id)

    def list_by_list(self, session: Session, list_id: uuid.UUID) -> list[Card]:
        """Return all cards of a list, ordered by ``order`` ascending (Req 7.7)."""
        statement = (
            select(Card).where(Card.list_id == list_id).order_by(col(Card.order))
        )
        return list(session.exec(statement).all())

    def get_cards_by_ids(
        self, session: Session, card_ids: list[uuid.UUID]
    ) -> list[Card]:
        """Return the cards whose ids are in ``card_ids`` (used by reorder).

        Returns an empty list when ``card_ids`` is empty. Order of the result is
        not guaranteed; callers validate membership against the requested ids.
        """
        if not card_ids:
            return []
        statement = select(Card).where(Card.id.in_(card_ids))  # type: ignore[attr-defined]
        return list(session.exec(statement).all())

    def update(self, session: Session, card: Card) -> Card:
        """Stage an updated ``Card``.

        Adds the instance back to the session and flushes so the change is
        visible within the transaction. Does NOT commit — the caller owns the
        transaction.
        """
        session.add(card)
        session.flush()
        return card

    def delete(self, session: Session, card: Card) -> None:
        """Stage a ``Card`` for deletion (Req 7.3).

        Does NOT commit — the caller owns the transaction.
        """
        session.delete(card)
        session.flush()

    def max_order(self, session: Session, list_id: uuid.UUID) -> int:
        """Return the current maximum ``order`` among a list's cards.

        Returns ``EMPTY_LIST_ORDER_SENTINEL`` (``-1``) when the list has no cards
        yet, so that the service can uniformly compute a new card's order as
        ``max_order + 1`` (the first card becomes order 0) — Req 7.1.
        """
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
        """Set the ``order`` and ``list_id`` of a single card by id and flush.

        Used by the atomic card reorder flow (Req 7.4): the service calls this
        for each item in the payload within one transaction and commits once at
        the end. Because cards can move across lists during a reorder, this
        updates both ``order`` and ``list_id``. Does NOT commit. No-op if the
        card id does not exist (the service is responsible for validating
        membership first).
        """
        card = session.get(Card, card_id)
        if card is None:
            return
        card.order = order
        card.list_id = list_id
        session.add(card)
        session.flush()
