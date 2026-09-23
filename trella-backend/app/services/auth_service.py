from datetime import timedelta

from sqlmodel import Session

from app.core import security
from app.core.config import settings
from app.models.users_model import User
from app.repositories.users_repository import UsersRepository

# Dummy hash used for constant-time mitigation when the email is unknown.
DUMMY_HASH = (
    "$argon2id$v=19$m=65536,t=3,p=4$"
    "MjQyZWE1MzBjYjJlZTI0Yw$YTU4NGM5ZTZmYjE2NzZlZjY0ZWY3ZGRkY2U2OWFjNjk"
)


class AuthService:
    """Authentication business logic: login + JWT encode/decode."""

    def __init__(self, users_repository: UsersRepository | None = None) -> None:
        self.users_repository = users_repository or UsersRepository()

    def authenticate(self, session: Session, email: str, password: str) -> User | None:
        """Return the user matching ``email``/``password``, else ``None``."""
        user = self.users_repository.get_by_email(session, email)
        if not user:
            # Constant-time mitigation: still run a verification on a dummy hash.
            security.verify_password(password, DUMMY_HASH)
            return None

        verified, updated_hash = security.verify_password(
            password, user.hashed_password
        )
        if not verified:
            return None

        if updated_hash:
            user.hashed_password = updated_hash
            session.add(user)
            session.commit()
            session.refresh(user)

        return user

    def create_token(self, user: User) -> str:
        """Mint a JWT access token with ``sub = str(user.id)``."""
        expires_delta = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
        return security.create_access_token(
            subject=str(user.id), expires_delta=expires_delta
        )

    def decode_token(self, token: str) -> str:
        """Decode/verify ``token`` and return its ``sub`` claim."""
        payload = security.decode_token(token)
        return str(payload["sub"])
