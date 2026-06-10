from fastapi import APIRouter

from app.endpoints.auth_router import router as auth_router
from app.endpoints.users_router import router as users_router

api_router = APIRouter()

# Layer-first auth/users routers (move-then-delete cutover complete, task 5.2).
# These register the template-compatible paths /login/access-token,
# /users/signup and /users/me via the NEW code. The legacy template routers
# (login, users, items, utils, private) and the template app/api/deps.py have
# been removed. New domain routers (organizations, boards, ...) are included
# here as they are implemented.
api_router.include_router(auth_router)
api_router.include_router(users_router)
