from fastapi import APIRouter

from app.endpoints.audit_logs_router import router as audit_logs_router
from app.endpoints.auth_router import router as auth_router
from app.endpoints.board_lists_router import router as board_lists_router
from app.endpoints.boards_router import router as boards_router
from app.endpoints.organizations_router import router as organizations_router
from app.endpoints.task_cards_router import router as task_cards_router
from app.endpoints.users_router import router as users_router

api_router = APIRouter()

# Central router registration for every domain. The global ``/api/v1`` prefix is
# applied once at ``app/main.py`` via ``app.include_router(api_router,
# prefix=settings.API_V1_STR)``, so the routers here declare only their own
# resource prefixes. Each domain router is included exactly once (no duplicates).
#
# Path compatibility (auth template paths preserved through the new code):
#   - auth_router        -> /api/v1/login/access-token
#   - users_router       -> /api/v1/users/signup, /api/v1/users/me
#   - organizations      -> /api/v1/organizations[/{org_id}]
#   - boards             -> /api/v1/boards[/{board_id}]
#   - board_lists        -> /api/v1/lists (domain "List", table "lists")
#   - task_cards         -> /api/v1/cards (domain "Card", table "cards")
#   - audit_logs         -> /api/v1/audit-logs,
#                           /api/v1/boards/{board_id}/audit-logs,
#                           /api/v1/cards/{card_id}/audit-logs
api_router.include_router(auth_router)
api_router.include_router(users_router)
api_router.include_router(organizations_router)
api_router.include_router(boards_router)
api_router.include_router(board_lists_router)
api_router.include_router(task_cards_router)
api_router.include_router(audit_logs_router)
