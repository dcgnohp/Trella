"""users router layer.

FastAPI ``APIRouter`` for the ``users`` domain.

Exposes the template-compatible auth-adjacent user endpoints under the
``/users`` prefix (the global ``/api/v1`` prefix is added at
``app/api/main.py``):

- ``POST /users/signup`` (full path ``/api/v1/users/signup``): public
  self-registration. Delegates to ``UsersService.register`` and returns a
  ``UserPublic`` (camelCase, never exposes the password).
- ``GET /users/me`` (full path ``/api/v1/users/me``): returns the authenticated
  user resolved by the ``get_current_user`` dependency.

Logic moved (not yet deleted) from the template ``app/api/routes/users.py``.
See requirements 2.1, 2.5 and design.md sections "9. Đăng ký router" and
"Dependency Injection (deps)".
"""

from fastapi import APIRouter

from app.core.deps import CurrentUser, SessionDep
from app.schemas.users_schema import UserPublic, UserRegister
from app.services.users_service import UsersService

router = APIRouter(prefix="/users", tags=["users"])

_service = UsersService()


@router.post("/signup", response_model=UserPublic)
def signup(session: SessionDep, data: UserRegister) -> UserPublic:
    """Register a new user without authentication.

    Returns the created user as ``UserPublic`` (no password). Raises HTTP 409
    "Email already registered" when the email is already taken.
    """
    user = _service.register(session, data)
    return UserPublic.model_validate(user)


@router.get("/me", response_model=UserPublic)
def read_current_user(current_user: CurrentUser) -> UserPublic:
    """Return the currently authenticated user (``id``, ``email``, ``full_name`` ...)."""
    return UserPublic.model_validate(current_user)
