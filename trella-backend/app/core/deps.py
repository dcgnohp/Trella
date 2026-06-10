"""core dependency-injection layer (layer-first ``deps``).

FastAPI dependencies shared across the new layer-first endpoints:

- ``get_db`` / ``SessionDep`` — a request-scoped SQLModel ``Session`` (one
  session == one transaction scope). Re-exported from ``app.core.db`` so callers
  can simply ``from app.core.deps import get_db``.
- ``get_current_user`` / ``CurrentUser`` — decode + verify the bearer JWT and
  load the authenticated ``User``; any problem maps to HTTP 401.
- ``get_current_org_member`` — assert the current user belongs to a given
  Organization, raising HTTP 403 otherwise.

See design.md section "Dependency Injection (deps)" and requirements 2.6, 4.1,
4.2. This is the NEW layer-first module living under ``app/core``; the legacy
template ``app/api/deps.py`` is left untouched and removed in a later task.
"""

from typing import TYPE_CHECKING, Annotated
from uuid import UUID

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jwt.exceptions import InvalidTokenError
from sqlmodel import Session

from app.core import security
from app.core.config import settings

# Re-export get_db from app.core.db so callers can use
# ``from app.core.deps import get_db`` as a single import surface for deps.
from app.core.db import get_db
from app.models.users_model import User

if TYPE_CHECKING:
    # Imported only for type checking — the model/service are built in task 8.
    # Keeping this under TYPE_CHECKING avoids any import-time dependency.
    from app.models.organization_members_model import OrganizationMember

__all__ = [
    "get_db",
    "SessionDep",
    "TokenDep",
    "get_current_user",
    "CurrentUser",
    "get_current_org_member",
]


SessionDep = Annotated[Session, Depends(get_db)]

# OAuth2 bearer scheme — token issued by POST /api/v1/login/access-token.
reusable_oauth2 = OAuth2PasswordBearer(
    tokenUrl=f"{settings.API_V1_STR}/login/access-token"
)
TokenDep = Annotated[str, Depends(reusable_oauth2)]


def get_current_user(session: SessionDep, token: TokenDep) -> User:
    """Resolve the authenticated user from the bearer JWT.

    Decodes/verifies the token (HS256, ``settings.SECRET_KEY``) via
    ``app.core.security.decode_token``. A missing/expired/malformed token, an
    unknown subject, or a non-uuid subject all map to HTTP 401. An inactive user
    maps to HTTP 400.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = security.decode_token(token)
        subject = payload["sub"]
        user_id = UUID(str(subject))
    except (InvalidTokenError, KeyError, ValueError):
        raise credentials_exception

    user = session.get(User, user_id)
    if not user:
        raise credentials_exception
    if not user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def get_current_org_member(
    org_id: UUID,
    current_user: CurrentUser,
    session: SessionDep,
) -> "OrganizationMember":
    """Assert the current user is a member of ``org_id``; else HTTP 403.

    The OrganizationMember model and OrganizationMemberService are built in
    task 8, so the dependency is resolved via a LAZY import inside the function
    body. This keeps this module importable at load time before task 8 lands.
    Once task 8 is in place, ``assert_member`` performs the membership lookup and
    raises 403 "Not a member of this organization" when the user is not a member.
    """
    # Lazy import: organization_members layer does not exist until task 8.
    from app.services.organization_members_service import (
        OrganizationMemberService,
    )

    member = OrganizationMemberService().assert_member(
        session, org_id, current_user.id
    )
    if member is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this organization",
        )
    return member
