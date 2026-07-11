import uuid

from fastapi import APIRouter, status

from app.core.deps import CurrentUser, SessionDep
from app.schemas.knowledge_collections_schema import (
    KnowledgeCollectionCreate,
    KnowledgeCollectionPublic,
    KnowledgeCollectionUpdate,
)
from app.services.knowledge_collections_service import KnowledgeCollectionsService

router = APIRouter(
    prefix="/workspaces/{workspace_id}/knowledge-collections",
    tags=["knowledge-collections"],
)

_service = KnowledgeCollectionsService()


@router.get("", response_model=list[KnowledgeCollectionPublic])
def list_collections(
    session: SessionDep,
    workspace_id: uuid.UUID,
    current_user: CurrentUser,
) -> list[KnowledgeCollectionPublic]:
    collections = _service.list_collections(session, workspace_id, current_user)
    return [KnowledgeCollectionPublic.model_validate(c) for c in collections]


@router.post("", response_model=KnowledgeCollectionPublic, status_code=status.HTTP_201_CREATED)
def create_collection(
    session: SessionDep,
    workspace_id: uuid.UUID,
    data: KnowledgeCollectionCreate,
    current_user: CurrentUser,
) -> KnowledgeCollectionPublic:
    collection = _service.create_collection(session, workspace_id, data, current_user)
    return KnowledgeCollectionPublic.model_validate(collection)


@router.patch("/{collection_id}", response_model=KnowledgeCollectionPublic)
def update_collection(
    session: SessionDep,
    workspace_id: uuid.UUID,
    collection_id: uuid.UUID,
    data: KnowledgeCollectionUpdate,
    current_user: CurrentUser,
) -> KnowledgeCollectionPublic:
    collection = _service.update_collection(session, workspace_id, collection_id, data, current_user)
    return KnowledgeCollectionPublic.model_validate(collection)


@router.delete("/{collection_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_collection(
    session: SessionDep,
    workspace_id: uuid.UUID,
    collection_id: uuid.UUID,
    current_user: CurrentUser,
) -> None:
    _service.delete_collection(session, workspace_id, collection_id, current_user)
