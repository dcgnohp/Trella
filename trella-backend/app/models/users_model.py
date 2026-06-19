from pydantic import EmailStr
from sqlmodel import Field

from app.core.base import TimestampMixin, UUIDMixin
from app.models.enums import UserAccountStatus


class User(UUIDMixin, TimestampMixin, table=True):
    __tablename__ = "users"

    email: EmailStr = Field(unique=True, index=True, max_length=255)
    full_name: str | None = Field(default=None, max_length=255)
    hashed_password: str
    is_active: bool = Field(default=True)
    is_superuser: bool = Field(default=False)
    status: str = Field(
        default=UserAccountStatus.ACTIVE.value,
        max_length=50,
    )
