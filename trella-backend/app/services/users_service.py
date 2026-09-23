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
        """Raise HTTP 409 if the email is already registered, otherwise create and return the user."""
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
