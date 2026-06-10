"""auth schema layer.

Pydantic request/response schemas for the ``auth`` domain.

Moved (not yet deleted) from the template ``app/models/models.py`` (``Token`` /
``TokenPayload``). The ``auth`` domain has no model/repository — only schema,
service and router (see design.md → exceptions for the ``auth`` domain).

- ``Token``: the access-token response returned by ``POST /login/access-token``.
- ``TokenPayload``: the decoded JWT payload (``sub`` = the user id as a string).
- ``LoginRequest``: an email + password request body provided for completeness.
  The actual OAuth2 endpoint uses ``OAuth2PasswordRequestForm`` (username +
  password), but a typed ``LoginRequest`` is useful for non-form callers/tests.

See requirements 2.3, 2.4, 2.7.
"""

from pydantic import EmailStr
from sqlmodel import Field, SQLModel


class Token(SQLModel):
    """Access-token response for a successful login."""

    access_token: str
    token_type: str = "bearer"


class TokenPayload(SQLModel):
    """Decoded JWT payload. ``sub`` carries the user id as a string."""

    sub: str | None = None


class LoginRequest(SQLModel):
    """Email + password login request body (non-form callers/tests)."""

    email: EmailStr = Field(max_length=255)
    password: str = Field(min_length=8, max_length=128)
