"""users schema layer.

Pydantic request/response schemas for the ``users`` domain.

- ``UserCreate`` / ``UserRegister``: request bodies for creating/registering a
  user. Both carry the plaintext ``password`` (validated, min length 8) which
  the service hashes before persisting — it is never stored as-is.
- ``UserPublic``: API response shape. It extends ``CamelModel`` so fields
  serialize to camelCase (``fullName``, ``isActive``, ``isSuperuser``,
  ``createdAt``, ``updatedAt``) and it deliberately EXCLUDES
  ``password`` / ``hashed_password``.

See requirements 2.1, 2.7 and design.md section "2. Serialization camelCase".
"""

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
    """API response for a user — never exposes password/hashed_password.

    Serializes to camelCase: ``fullName``, ``isActive``, ``isSuperuser``,
    ``createdAt``, ``updatedAt``.
    """

    id: uuid.UUID
    email: EmailStr
    full_name: str | None = None
    is_active: bool
    is_superuser: bool
    created_at: datetime
    updated_at: datetime
