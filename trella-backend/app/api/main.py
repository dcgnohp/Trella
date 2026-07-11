from fastapi import APIRouter

from app.endpoints.activity_logs_router import router as activity_logs_router
from app.endpoints.attachments_router import router as attachments_router
from app.endpoints.audit_logs_router import router as audit_logs_router
from app.endpoints.auth_router import router as auth_router
from app.endpoints.board_columns_router import router as board_columns_router
from app.endpoints.board_lists_router import router as board_lists_router
from app.endpoints.board_members_router import router as board_members_router
from app.endpoints.boards_router import router as boards_router
from app.endpoints.canonical_statuses_router import router as canonical_statuses_router
from app.endpoints.comments_router import router as comments_router
from app.endpoints.custom_statuses_router import router as custom_statuses_router
from app.endpoints.docs_router import router as docs_router
from app.endpoints.epics_router import router as epics_router
from app.endpoints.knowledge_collections_router import (
    router as knowledge_collections_router,
)
from app.endpoints.knowledge_user_prefs_router import (
    router as knowledge_user_prefs_router,
)
from app.endpoints.notifications_router import router as notifications_router
from app.endpoints.organizations_router import (
    router as organizations_router,
)
from app.endpoints.organizations_router import (
    workspaces_router,
)
from app.endpoints.plans_router import router as plans_router
from app.endpoints.project_members_router import router as project_members_router
from app.endpoints.projects_router import router as projects_router
from app.endpoints.reports_router import router as reports_router
from app.endpoints.sprints_router import router as sprints_router
from app.endpoints.summary_router import router as summary_router
from app.endpoints.task_cards_router import router as task_cards_router
from app.endpoints.tasks_router import backlog_router
from app.endpoints.tasks_router import router as tasks_router
from app.endpoints.users_router import router as users_router
from app.endpoints.velocity_config_router import router as velocity_config_router
from app.endpoints.workflows_router import router as workflows_router
from app.endpoints.workspace_members_router import router as workspace_members_router

api_router = APIRouter()


# --- Core / preserved domains ---
api_router.include_router(auth_router)
api_router.include_router(users_router)
api_router.include_router(boards_router)
api_router.include_router(board_members_router)
api_router.include_router(audit_logs_router)

# --- NEW canonical domains (task-collaboration-and-status-mapping) ---
api_router.include_router(board_columns_router)
api_router.include_router(projects_router)
api_router.include_router(plans_router)
api_router.include_router(project_members_router)
api_router.include_router(workspace_members_router)
api_router.include_router(comments_router)
api_router.include_router(attachments_router)
api_router.include_router(canonical_statuses_router)
api_router.include_router(custom_statuses_router)
api_router.include_router(activity_logs_router)
api_router.include_router(notifications_router)
api_router.include_router(tasks_router)

# --- Jira-mode domains ---
api_router.include_router(sprints_router)
api_router.include_router(epics_router)
api_router.include_router(backlog_router)
api_router.include_router(workspaces_router)
api_router.include_router(docs_router)
api_router.include_router(knowledge_collections_router)
api_router.include_router(knowledge_user_prefs_router)
api_router.include_router(reports_router)
api_router.include_router(velocity_config_router)
api_router.include_router(summary_router)
api_router.include_router(workflows_router)

# --- LEGACY deprecated aliases (no behavior change, OpenAPI-flagged) ---
api_router.include_router(organizations_router, deprecated=True)
api_router.include_router(board_lists_router, deprecated=True)
api_router.include_router(task_cards_router, deprecated=True)
