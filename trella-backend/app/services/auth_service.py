"""auth service layer.

Service (business logic) for the ``auth`` domain.

Moved (not yet deleted) from the template ``app/crud.py`` (``authenticate`` +
the timing-attack-safe dummy-hash pattern) and ``app/api/routes/login.py`` (JWT
creation). The ``auth`` domain has no model/repository of its own; it reuses the
``users`` domain's ``UsersRepository`` for lookups and ``app.core.security`` for
JWT/password primitives.

Responsibilities:

- ``authenticate``: verify an email/password pair, returning the ``User`` or
  ``None``. Runs a dummy-hash verification when the user is absent to keep the
  response time constant (timing-attack mitigation), and transparently persists
  an upgraded password hash when ``verify_password`` returns one.
- ``create_token``: mint a JWT access token whose ``sub`` is ``str(user.id)``.
- ``decode_token``: decode/verify a JWT and return its ``sub``.

See requirements 2.3, 2.4, 2.7.
"""

from datetime import timedelta

from sqlmodel import Session

from app.core import security
from app.core.config import settings
from app.models.users_model import User
from app.repositories.users_repository import UsersRepository

# Dummy Argon2 hash used for timing-attack prevention when the email is unknown.
# Verifying against this keeps the code path (and response time) similar whether
# or not the user exists. Ported from template ``app/crud.py``.
DUMMY_HASH = (
    "$argon2id$v=19$m=65536,t=3,p=4$"
    "MjQyZWE1MzBjYjJlZTI0Yw$YTU4NGM5ZTZmYjE2NzZlZjY0ZWY3ZGRkY2U2OWFjNjk"
)


class AuthService:
    """Authentication business logic: login + JWT encode/decode."""

    def __init__(self, users_repository: UsersRepository | None = None) -> None:
        self.users_repository = users_repository or UsersRepository()

    def authenticate(
        self, session: Session, email: str, password: str
    ) -> User | None:
        """Return the user matching ``email``/``password``, else ``None``.

        Runs a dummy-hash verification when the user is not found so the timing
        of a failed login does not reveal whether the email exists. If
        ``verify_password`` returns an upgraded hash, it is persisted.
        """
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
        """Decode/verify ``token`` and return its ``sub`` claim.

        Propagates ``jwt.InvalidTokenError`` (and subclasses such as
        ``ExpiredSignatureError``) for missing, malformed, expired, or
        bad-signature tokens.
        """
        payload = security.decode_token(token)
        return payload["sub"]
