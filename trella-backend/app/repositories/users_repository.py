import uuid

from sqlmodel import Session, select

from app.models.users_model import User


class UsersRepository:
    def get_by_email(self, session: Session, email: str) -> User | None:
        """Return the user with the given email, or ``None`` if absent."""
        statement = select(User).where(User.email == email)
        return session.exec(statement).first()

    def get(self, session: Session, user_id: uuid.UUID) -> User | None:
        """Return the user with the given id, or ``None`` if absent."""
        return session.get(User, user_id)

    def create(self, session: Session, user: User) -> User:
        """Stage a new ``User`` for insertion without committing."""
        session.add(user)
        session.flush()
        return user
