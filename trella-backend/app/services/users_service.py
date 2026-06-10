"""users service layer.

Service (business logic) for the ``users`` domain.

Owns the registration use case: enforce the unique-email rule, hash the password
with Argon2 (via ``app.core.security.hash_password``), persist the user through
``UsersRepository`` and own the transaction (commit / refresh).

Logic moved (not yet deleted) from the template ``app/crud.py`` and
``app/api/routes/users.py``. See requirements 2.1, 2.2 and ``design.md``
section "Error Handling" (409 "Email already registered").
"""

import uuid

from fastapi import HTTPException, status
from sqlmodel import Session

from app.core.security import hash_password
from app.models.users_model import User
from app.repositories.users_repository import UsersRepository
from app.schemas.users_schema import UserRegister


class UsersService:
    """Business logic for the ``users`` domain."""

    def __init__(self, repo: UsersRepository | None = None) -> None:
        self.repo = repo or UsersRepository()

    def register(self, session: Session, data: UserRegister) -> User:
        """Register a new user.

        Raises HTTP 409 "Email already registered" if the email is taken.
        Otherwise hashes the password (Argon2), persists the user and commits.
        """
        existing = self.repo.get_by_email(session, data.email)
        if existing is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Email already registered",
            )

        user = User(
            email=data.email,
            full_name=data.full_name,
            hashed_password=hash_password(data.password),
        )
        self.repo.create(session, user)
        session.commit()
        session.refresh(user)
        return user

    def get_by_id(self, session: Session, user_id: uuid.UUID) -> User | None:
        """Return the user with the given id, or ``None`` if absent."""
        return self.repo.get(session, user_id)
