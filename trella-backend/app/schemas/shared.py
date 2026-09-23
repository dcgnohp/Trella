import uuid

from app.core.base import CamelModel

# Placeholder returned when a User row no longer exists (hard-deleted).
DELETED_USER_PLACEHOLDER = "Deleted User"


class AuthorPublic(CamelModel):
    """Public attribution for the person who performed/owns a resource."""

    id: uuid.UUID
    full_name: str | None = None
    avatar_url: str | None = None
