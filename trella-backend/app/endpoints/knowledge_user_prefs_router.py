import uuid

from fastapi import APIRouter

from app.core.deps import CurrentUser, SessionDep
from app.schemas.knowledge_user_prefs_schema import (
    KnowledgeUserPrefPublic,
    KnowledgeUserPrefUpsert,
)
from app.services.knowledge_user_prefs_service import KnowledgeUserPrefsService

router = APIRouter(
    prefix="/workspaces/{workspace_id}/docs/prefs", tags=["knowledge-prefs"]
)
_service = KnowledgeUserPrefsService()


@router.get("", response_model=list[KnowledgeUserPrefPublic])
def list_prefs(
    session: SessionDep,
    workspace_id: uuid.UUID,
    current_user: CurrentUser,
) -> list[KnowledgeUserPrefPublic]:
    prefs = _service.list_prefs(session, workspace_id, current_user)
    return [KnowledgeUserPrefPublic.model_validate(p) for p in prefs]


@router.post("", response_model=KnowledgeUserPrefPublic)
def upsert_pref(
    session: SessionDep,
    workspace_id: uuid.UUID,
    data: KnowledgeUserPrefUpsert,
    current_user: CurrentUser,
) -> KnowledgeUserPrefPublic:
    pref = _service.upsert_pref(session, workspace_id, data, current_user)
    return KnowledgeUserPrefPublic.model_validate(pref)


@router.post("/{doc_id}/viewed", response_model=KnowledgeUserPrefPublic)
def mark_viewed(
    session: SessionDep,
    workspace_id: uuid.UUID,
    doc_id: uuid.UUID,
    current_user: CurrentUser,
) -> KnowledgeUserPrefPublic:
    pref = _service.mark_viewed(session, workspace_id, doc_id, current_user)
    return KnowledgeUserPrefPublic.model_validate(pref)
