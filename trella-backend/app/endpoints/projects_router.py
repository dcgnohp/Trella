import uuid

from fastapi import APIRouter, status

from app.core.deps import CurrentUser, SessionDep
from app.schemas.projects_schema import ProjectCreate, ProjectPublic
from app.services.projects_service import ProjectsService

router = APIRouter(tags=["projects"])

_service = ProjectsService()


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
