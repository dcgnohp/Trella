"""users repository layer.

Repository (DB access) for the ``users`` domain.

This is the ONLY place that issues SQLModel queries for the ``User`` model. Per
the design (``design.md`` → "Repository interface"), every method receives the
``Session`` from the caller (the service) so the repository participates in the
service-owned transaction. The repository never commits — the service decides
when to ``commit()`` / ``rollback()``.

Logic moved (not yet deleted) from the template ``app/crud.py``
(``get_user_by_email`` / ``create_user``). See requirements 2.1, 2.2.
"""

import uuid

from sqlmodel import Session, select

from app.models.users_model import User


class UsersRepository:
    """DB access for the ``users`` table.

    All methods take an explicit ``session`` and avoid committing so callers can
    compose several operations inside one transaction.
    """

    def get_by_email(self, session: Session, email: str) -> User | None:
        """Return the user with the given email, or ``None`` if absent."""
        statement = select(User).where(User.email == email)
        return session.exec(statement).first()

    def get(self, session: Session, user_id: uuid.UUID) -> User | None:
        """Return the user with the given id, or ``None`` if absent."""
        return session.get(User, user_id)

    def create(self, session: Session, user: User) -> User:
        """Stage a new ``User`` for insertion.

        Adds the instance to the session and flushes so the database-generated
        state (e.g. the primary key) is populated, but does NOT commit — the
        service owns the transaction and is responsible for committing.
        """
        session.add(user)
        session.flush()
        return user
