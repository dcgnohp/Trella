"""Shared base classes and mixins for SQLModel schemas and table models.

This module centralizes patterns reused across every domain:

- ``CamelModel``: base for request/response schemas that serialize snake_case
  fields to camelCase aliases (e.g. ``org_id`` -> ``orgId``) while still
  accepting snake_case input thanks to ``populate_by_name=True``.
- ``UUIDMixin``: reusable ``uuid4`` primary key.
- ``TimestampMixin``: timezone-aware ``created_at`` / ``updated_at`` columns.

See design.md sections "2. Serialization camelCase" and "Data Models".
"""

import uuid
from datetime import datetime, timezone

from pydantic import ConfigDict
from pydantic.alias_generators import to_camel
from sqlalchemy import DateTime
from sqlmodel import Field, SQLModel


def utcnow() -> datetime:
    """Return the current timezone-aware UTC timestamp."""
    return datetime.now(timezone.utc)


class CamelModel(SQLModel):
    """Base for request/response schemas using camelCase aliases.

    Fields are declared in snake_case (matching DB columns) and serialized to
    camelCase via ``alias_generator=to_camel``. ``populate_by_name=True`` keeps
    snake_case input valid too, so request bodies accept either casing.
    """

    model_config = ConfigDict(  # type: ignore[assignment]
        alias_generator=to_camel,
        populate_by_name=True,
    )


class UUIDMixin(SQLModel):
    """Mixin providing a ``uuid4`` primary key shared across table models."""

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)


class TimestampMixin(SQLModel):
    """Mixin providing timezone-aware ``created_at`` / ``updated_at`` columns.

    Both default to the current UTC time on insert. ``updated_at`` also refreshes
    automatically on update via SQLAlchemy's ``onupdate`` hook.
    """

    created_at: datetime = Field(
        default_factory=utcnow,
        sa_type=DateTime(timezone=True),  # type: ignore[call-overload]
        nullable=False,
    )
    updated_at: datetime = Field(
        default_factory=utcnow,
        sa_type=DateTime(timezone=True),  # type: ignore[call-overload]
        sa_column_kwargs={"onupdate": utcnow},
        nullable=False,
    )
