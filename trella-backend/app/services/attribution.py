import uuid

from sqlmodel import Session

from app.models.users_model import User
from app.schemas.shared import DELETED_USER_PLACEHOLDER, AuthorPublic


def resolve_actor(session: Session, user_id: uuid.UUID) -> AuthorPublic:
    """Resolve a user_id into an AuthorPublic for attribution.

    Returns the real full_name for existing users (including soft-deleted).
    Falls back to the deleted-user placeholder only when the row is absent.
    """
    user = session.get(User, user_id)
    if user is None:
        return AuthorPublic(
            id=user_id,
            full_name=DELETED_USER_PLACEHOLDER,
            avatar_url=None,
        )
    return AuthorPublic(
        id=user.id,
        full_name=user.full_name,
        avatar_url=None,
    )
