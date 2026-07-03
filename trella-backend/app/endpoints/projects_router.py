import uuid

from fastapi import APIRouter, HTTPException, status

from app.core.deps import CurrentUser, SessionDep
from app.repositories.projects_repository import ProjectsRepository
from app.schemas.projects_schema import ProjectCreate, ProjectPublic
from app.services.projects_service import ProjectsService

router = APIRouter(tags=["projects"])

_service = ProjectsService()
_repo = ProjectsRepository()


@router.post(
    "/workspaces/{workspace_id}/projects",
    response_model=ProjectPublic,
    status_code=status.HTTP_201_CREATED,
)
def create_project(
    session: SessionDep,
    workspace_id: uuid.UUID,
    data: ProjectCreate,
    current_user: CurrentUser,
) -> ProjectPublic:
    project = _service.create_project(session, workspace_id, data, current_user)
    return ProjectPublic.model_validate(project)


@router.get("/projects/{project_id}", response_model=ProjectPublic)
def get_project(
    session: SessionDep,
    project_id: uuid.UUID,
    _current_user: CurrentUser,
) -> ProjectPublic:
    project = _repo.get(session, project_id)
    if project is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Project not found"
        )
    return ProjectPublic.model_validate(project)
