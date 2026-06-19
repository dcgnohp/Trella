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
    """OAuth2-compatible password login; returns a bearer access token."""
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
