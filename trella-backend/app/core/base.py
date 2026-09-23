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
    """Base schema with camelCase serialization and snake_case input support."""

    model_config = ConfigDict(  # type: ignore[assignment]
        alias_generator=to_camel,
        populate_by_name=True,
    )


class UUIDMixin(SQLModel):
    """Mixin providing a ``uuid4`` primary key shared across table models."""

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)


class TimestampMixin(SQLModel):
    """Mixin providing timezone-aware ``created_at`` / ``updated_at`` columns."""

    # pyrefly: ignore [no-matching-overload]
    created_at: datetime = Field(
        default_factory=utcnow,
        sa_type=DateTime(timezone=True),  # type: ignore[call-overload]
        nullable=False,
    )
    # pyrefly: ignore [no-matching-overload]
    updated_at: datetime = Field(
        default_factory=utcnow,
        sa_type=DateTime(timezone=True),  # type: ignore[call-overload]
        sa_column_kwargs={"onupdate": utcnow},
        nullable=False,
    )
