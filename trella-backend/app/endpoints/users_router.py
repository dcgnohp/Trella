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
