import uuid

from fastapi import APIRouter, status

from app.core.deps import CurrentUser, SessionDep
from app.schemas.sprints_schema import SprintCreate, SprintPublic, SprintUpdate
from app.services.sprints_service import SprintsService

router = APIRouter(tags=["sprints"])

_service = SprintsService()


@router.post(
    "/projects/{project_id}/sprints",
    response_model=SprintPublic,
    status_code=status.HTTP_201_CREATED,
)
def create_sprint(
    session: SessionDep,
    project_id: uuid.UUID,
    data: SprintCreate,
    current_user: CurrentUser,
) -> SprintPublic:
    sprint = _service.create_sprint(session, project_id, data, current_user)
    return SprintPublic.model_validate(sprint)


@router.get("/projects/{project_id}/sprints", response_model=list[SprintPublic])
def list_sprints(
    session: SessionDep,
    project_id: uuid.UUID,
    current_user: CurrentUser,
) -> list[SprintPublic]:
    sprints = _service.list_sprints(session, project_id, current_user)
    return [SprintPublic.model_validate(s) for s in sprints]


@router.get("/sprints/{sprint_id}", response_model=SprintPublic)
def get_sprint(
    session: SessionDep,
    sprint_id: uuid.UUID,
    current_user: CurrentUser,
) -> SprintPublic:
    sprint = _service.get_sprint(session, sprint_id, current_user)
    return SprintPublic.model_validate(sprint)


@router.patch("/sprints/{sprint_id}", response_model=SprintPublic)
def update_sprint(
    session: SessionDep,
    sprint_id: uuid.UUID,
    data: SprintUpdate,
    current_user: CurrentUser,
) -> SprintPublic:
    sprint = _service.update_sprint(session, sprint_id, data, current_user)
    return SprintPublic.model_validate(sprint)


@router.delete("/sprints/{sprint_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_sprint(
    session: SessionDep,
    sprint_id: uuid.UUID,
    current_user: CurrentUser,
) -> None:
    _service.delete_sprint(session, sprint_id, current_user)


@router.post("/sprints/{sprint_id}/start", response_model=SprintPublic)
def start_sprint(
    session: SessionDep,
    sprint_id: uuid.UUID,
    current_user: CurrentUser,
) -> SprintPublic:
    sprint = _service.start_sprint(session, sprint_id, current_user)
    return SprintPublic.model_validate(sprint)


@router.post("/sprints/{sprint_id}/complete", response_model=SprintPublic)
def complete_sprint(
    session: SessionDep,
    sprint_id: uuid.UUID,
    current_user: CurrentUser,
) -> SprintPublic:
    sprint = _service.complete_sprint(session, sprint_id, current_user)
    return SprintPublic.model_validate(sprint)


@router.post("/sprints/{sprint_id}/tasks/{task_id}", response_model=dict)
def add_task_to_sprint(
    session: SessionDep,
    sprint_id: uuid.UUID,
    task_id: uuid.UUID,
    current_user: CurrentUser,
) -> dict:
    _service.add_task_to_sprint(session, sprint_id, task_id, current_user)
    return {"success": True}


@router.delete(
    "/sprints/{sprint_id}/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT
)
def remove_task_from_sprint(
    session: SessionDep,
    sprint_id: uuid.UUID,
    task_id: uuid.UUID,
    current_user: CurrentUser,
) -> None:
    _service.remove_task_from_sprint(session, sprint_id, task_id, current_user)
