import uuid

from fastapi import APIRouter, status

from app.core.deps import CurrentUser, SessionDep
from app.schemas.docs_schema import DocCreate, DocPublic, DocUpdate
from app.services.docs_service import DocsService

router = APIRouter(prefix="/workspaces/{workspace_id}/docs", tags=["docs"])

_service = DocsService()


@router.get("", response_model=list[DocPublic])
def list_docs(session: SessionDep, workspace_id: uuid.UUID, current_user: CurrentUser) -> list[DocPublic]:
    docs = _service.list_docs(session, workspace_id, current_user)
    return [DocPublic.model_validate(d) for d in docs]


@router.post("", response_model=DocPublic, status_code=status.HTTP_201_CREATED)
def create_doc(session: SessionDep, workspace_id: uuid.UUID, data: DocCreate, current_user: CurrentUser) -> DocPublic:
    doc = _service.create_doc(session, workspace_id, data, current_user)
    return DocPublic.model_validate(doc)


@router.get("/{doc_id}", response_model=DocPublic)
def get_doc(session: SessionDep, workspace_id: uuid.UUID, doc_id: uuid.UUID, current_user: CurrentUser) -> DocPublic:
    doc = _service.get_doc(session, workspace_id, doc_id, current_user)
    return DocPublic.model_validate(doc)


@router.patch("/{doc_id}", response_model=DocPublic)
def update_doc(session: SessionDep, workspace_id: uuid.UUID, doc_id: uuid.UUID, data: DocUpdate, current_user: CurrentUser) -> DocPublic:
    doc = _service.update_doc(session, workspace_id, doc_id, data, current_user)
    return DocPublic.model_validate(doc)


@router.delete("/{doc_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_doc(session: SessionDep, workspace_id: uuid.UUID, doc_id: uuid.UUID, current_user: CurrentUser) -> None:
    _service.delete_doc(session, workspace_id, doc_id, current_user)
