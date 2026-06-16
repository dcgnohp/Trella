"""board_lists repository layer.

Repository (DB access) for the ``board_lists`` domain.

This is the ONLY place that issues SQLModel queries for the ``List`` model. Per
the design (``design.md`` -> "Repository interface"), every method receives the
``Session`` from the caller (the service) so the repository participates in the
service-owned transaction. Write methods never commit — the service decides when
to ``commit()`` / ``rollback()`` (critical for the atomic reorder/copy flows,
Req 6.4 / 6.6 / Req 11). Read methods are free to query directly.

Note: the model class is named ``List`` (the frontend domain type) and is
imported here as such; this module uses built-in ``list[...]`` generics for
return annotations to avoid any ambiguity with ``typing.List``.

See requirements 6.1, 6.7.
"""

import uuid

from sqlmodel import Session, col, func, select

from app.models.board_lists_model import List

# Sentinel returned by ``max_order`` when a board has no lists yet. The service
# computes a new list's order as ``max_order + 1``; with this sentinel the first
# list in an empty board receives order 0.
EMPTY_BOARD_ORDER_SENTINEL = -1


class BoardListsRepository:
    """DB access for the ``lists`` table.

    All methods take an explicit ``session``; write methods (``create``,
    ``update``, ``delete``, ``update_order``) avoid committing so callers can
    compose several operations inside one transaction.
    """

    def create(self, session: Session, board_list: List) -> List:
        """Stage a new ``List`` for insertion.

        Adds the instance to the session and flushes so database-generated state
        (e.g. the primary key) is populated, but does NOT commit — the service
        owns the transaction and is responsible for committing.
        """
        session.add(board_list)
        session.flush()
        return board_list

    def get(self, session: Session, list_id: uuid.UUID) -> List | None:
        """Return the list with the given id, or ``None`` if absent."""
        return session.get(List, list_id)

    def list_by_board(self, session: Session, board_id: uuid.UUID) -> list[List]:
        """Return all lists of a board, ordered by ``order`` ascending (Req 6.7)."""
        statement = (
            select(List).where(List.board_id == board_id).order_by(col(List.order))
        )
        return list(session.exec(statement).all())

    def get_lists_by_ids(
        self, session: Session, list_ids: list[uuid.UUID]
    ) -> list[List]:
        """Return the lists whose ids are in ``list_ids`` (used by reorder).

        Returns an empty list when ``list_ids`` is empty. Order of the result is
        not guaranteed; callers validate membership against the requested ids.
        """
        if not list_ids:
            return []
        statement = select(List).where(List.id.in_(list_ids))  # type: ignore[attr-defined]
        return list(session.exec(statement).all())

    def update(self, session: Session, board_list: List) -> List:
        """Stage an updated ``List``.

        Adds the instance back to the session and flushes so the change is
        visible within the transaction. Does NOT commit — the caller owns the
        transaction.
        """
        session.add(board_list)
        session.flush()
        return board_list

    def delete(self, session: Session, board_list: List) -> None:
        """Stage a ``List`` for deletion.

        Removing the list cascades to its cards via the FK ``ON DELETE CASCADE``.
        Does NOT commit — the caller owns the transaction.
        """
        session.delete(board_list)
        session.flush()

    def max_order(self, session: Session, board_id: uuid.UUID) -> int:
        """Return the current maximum ``order`` among a board's lists.

        Returns ``EMPTY_BOARD_ORDER_SENTINEL`` (``-1``) when the board has no
        lists yet, so that the service can uniformly compute a new list's order
        as ``max_order + 1`` (the first list becomes order 0) — Req 6.1.
        """
        statement = select(func.max(List.order)).where(List.board_id == board_id)
        result = session.exec(statement).one()
        return EMPTY_BOARD_ORDER_SENTINEL if result is None else result

    def update_order(
        self, session: Session, list_id: uuid.UUID, order: int
    ) -> None:
        """Set the ``order`` of a single list by id and flush.

        Used by the atomic reorder flow (Req 6.4): the service calls this for
        each item in the payload within one transaction and commits once at the
        end. Does NOT commit. No-op if the list id does not exist (the service is
        responsible for validating membership first).
        """
        board_list = session.get(List, list_id)
        if board_list is None:
            return
        board_list.order = order
        session.add(board_list)
        session.flush()
