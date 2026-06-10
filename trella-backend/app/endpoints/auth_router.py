"""auth router layer.

FastAPI APIRouter for the ``auth`` domain.

Moved (not yet deleted) from the template ``app/api/routes/login.py`` — the
OAuth2 access-token login endpoint. The ``auth`` domain has no model/repository;
the router delegates to ``AuthService`` for authentication and JWT minting.

Path compatibility: this router declares no prefix and the route is
``POST /login/access-token``. Since ``app/api/main.py`` mounts every domain
router under the ``/api/v1`` prefix, the final public path is exactly
``/api/v1/login/access-token`` (the template-compatible login path).

See requirements 2.3, 2.4 and design.md → exceptions for the ``auth`` domain.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm

from app.core.deps import SessionDep
from app.schemas.auth_schema import Token
from app.services.auth_service import AuthService

router = APIRouter(tags=["login"])


@router.post("/login/access-token", response_model=Token)
def login_access_token(
    session: SessionDep,
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
) -> Token:
    """OAuth2-compatible password login; returns a bearer access token.

    The form ``username`` field carries the user's email. On invalid
    credentials a 401 ``Incorrect email or password`` is raised; otherwise a
    freshly minted JWT access token is returned with ``token_type="bearer"``.
    """
    auth_service = AuthService()
    user = auth_service.authenticate(
        session, email=form_data.username, password=form_data.password
    )
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )

    return Token(access_token=auth_service.create_token(user), token_type="bearer")
