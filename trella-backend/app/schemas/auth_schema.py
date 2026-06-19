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
