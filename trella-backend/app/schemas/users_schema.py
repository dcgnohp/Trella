import uuid
from datetime import datetime

from pydantic import EmailStr
from sqlmodel import Field, SQLModel

from app.core.base import CamelModel


class UserCreate(SQLModel):
    """Request body for creating a user (admin/internal create)."""

    email: EmailStr = Field(max_length=255)
    password: str = Field(min_length=8, max_length=128)
    full_name: str | None = Field(default=None, max_length=255)


class UserRegister(SQLModel):
    """Request body for public self-registration (``POST /users/signup``)."""

    email: EmailStr = Field(max_length=255)
    password: str = Field(min_length=8, max_length=128)
    full_name: str | None = Field(default=None, max_length=255)


class UserPublic(CamelModel):
    """API response for a user — never exposes password/hashed_password."""

    id: uuid.UUID
    email: EmailStr
    full_name: str | None = None
    is_active: bool
    is_superuser: bool
    created_at: datetime
    updated_at: datetime
