"""boards repository layer.

Repository (DB access) for the ``boards`` domain.

This is the ONLY place that issues SQLModel queries for the ``Board`` model.
Per the design (``design.md`` -> "Repository interface"), every method receives
the ``Session`` from the caller (the service) so the repository participates in
the service-owned transaction. Write methods never commit — the service decides
when to ``commit()`` / ``rollback()``. Read methods are free to query directly.

See requirements 5.1, 5.7, 4.3.
"""

import uuid

from sqlmodel import Session, func, select

from app.models.boards_model import Board


class BoardsRepository:
    """DB access for the ``boards`` table.

    All methods take an explicit ``session``; write methods (``create``,
    ``update``, ``delete``) avoid committing so callers can compose several
    operations inside one transaction.
    """

    def create(self, session: Session, board: Board) -> Board:
        """Stage a new ``Board`` for insertion.

        Adds the instance to the session and flushes so database-generated state
        (e.g. the primary key) is populated, but does NOT commit — the service
        owns the transaction and is responsible for committing.
        """
        session.add(board)
        session.flush()
        return board

    def get(self, session: Session, board_id: uuid.UUID) -> Board | None:
        """Return the board with the given id, or ``None`` if absent."""
        return session.get(Board, board_id)

    def list_by_org(self, session: Session, org_id: uuid.UUID) -> list[Board]:
        """Return all boards owned by the given organization (org-scoped)."""
        statement = select(Board).where(Board.org_id == org_id)
        return list(session.exec(statement).all())

    def update(self, session: Session, board: Board) -> Board:
        """Stage an updated ``Board``.

        Adds the instance back to the session and flushes so the change is
        visible within the transaction. Does NOT commit — the caller owns the
        transaction.
        """
        session.add(board)
        session.flush()
        return board

    def delete(self, session: Session, board: Board) -> None:
        """Stage a ``Board`` for deletion.

        Removing the board cascades to its lists and cards via the FK
        ``ON DELETE CASCADE``. Does NOT commit — the caller owns the transaction.
        """
        session.delete(board)
        session.flush()

    def count_by_org(self, session: Session, org_id: uuid.UUID) -> int:
        """Return the number of boards owned by the given organization."""
        statement = select(func.count()).select_from(Board).where(
            Board.org_id == org_id
        )
        return session.exec(statement).one()
