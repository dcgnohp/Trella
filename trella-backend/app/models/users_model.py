"""users model layer.

SQLModel table model for the ``users`` domain.

Moved (not yet deleted) from the template ``app/models/models.py``. The table is
named ``users`` EXPLICITLY via ``__tablename__`` — the template default inferred
``user`` from the class name, and we now standardize on the plural ``users`` to
match the design (Alembic ``0001_foundational_tables.py``) and the foreign keys
that reference ``users.id``.

Reuses ``UUIDMixin`` (uuid4 primary key) and ``TimestampMixin`` (timezone-aware
``created_at`` / ``updated_at``) from ``app/core/base.py`` to stay consistent
with every other domain model.

See requirements 2.1, 2.7 and design.md section "Data Models".
"""

from pydantic import EmailStr
from sqlmodel import Field

from app.core.base import TimestampMixin, UUIDMixin


class User(UUIDMixin, TimestampMixin, table=True):
    """``users`` table: an authenticatable account.

    Columns map to snake_case; ``email`` is unique + indexed. ``hashed_password``
    stores the Argon2 hash (never the plaintext) and is never exposed via API
    schemas (see ``UserPublic`` in ``app/schemas/users_schema.py``).
    """

    __tablename__ = "users"

    email: EmailStr = Field(unique=True, index=True, max_length=255)
    full_name: str | None = Field(default=None, max_length=255)
    hashed_password: str
    is_active: bool = Field(default=True)
    is_superuser: bool = Field(default=False)
