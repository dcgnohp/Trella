import uuid

from fastapi import APIRouter, status

from app.core.deps import CurrentUser, SessionDep
from app.models.tasks_model import Task
from app.repositories.custom_statuses_repository import CustomStatusesRepository
from app.schemas.epics_schema import (
    EpicCreate,
    EpicProgressPublic,
    EpicPublic,
    EpicUpdate,
    EpicWithTasksPublic,
)
from app.schemas.tasks_schema import CustomStatusEmbed, TaskPublic
from app.services.epics_service import EpicsService

router = APIRouter(tags=["epics"])

_service = EpicsService()
_custom_statuses_repo = CustomStatusesRepository()


def _task_to_epic_public(_session: SessionDep, task: Task) -> EpicPublic:
    return EpicPublic(
        id=task.id,
        project_id=task.project_id,
        board_id=task.board_id,
        column_id=task.column_id,
        title=task.title,
        description=task.description,
        priority=task.priority,
        due_date=task.due_date,
        assignee_id=task.assignee_id,
        custom_status_id=task.custom_status_id,
        position=task.position,
        type=task.type,
        story_point=task.story_point,
        sprint_id=task.sprint_id,
        epic_id=task.epic_id,
        created_at=task.created_at,
        updated_at=task.updated_at,
    )


def _task_to_public(session: SessionDep, task: Task) -> TaskPublic:
    custom_status: CustomStatusEmbed | None = None
    if task.custom_status_id is not None:
        cs = _custom_statuses_repo.get(session, task.custom_status_id)
        if cs is not None:
            custom_status = CustomStatusEmbed(
                id=cs.id,
                name=cs.name,
                color=cs.color,
                canonical_status=cs.canonical_status,
            )
    return TaskPublic(
        id=task.id,
        project_id=task.project_id,
        board_id=task.board_id,
        column_id=task.column_id,
        title=task.title,
        description=task.description,
        priority=task.priority,
        due_date=task.due_date,
        assignee_id=task.assignee_id,
        custom_status_id=task.custom_status_id,
        custom_status=custom_status,
        position=task.position,
        type=task.type,
        story_point=task.story_point,
        sprint_id=task.sprint_id,
        epic_id=task.epic_id,
        created_at=task.created_at,
        updated_at=task.updated_at,
    )


@router.post(
    "/projects/{project_id}/epics",
    response_model=EpicPublic,
    status_code=status.HTTP_201_CREATED,
)
def create_epic(
    session: SessionDep,
    project_id: uuid.UUID,
    data: EpicCreate,
    current_user: CurrentUser,
) -> EpicPublic:
    task = _service.create_epic(session, project_id, data, current_user)
    return _task_to_epic_public(session, task)


@router.get("/projects/{project_id}/epics", response_model=list[EpicPublic])
def list_epics(
    session: SessionDep,
    project_id: uuid.UUID,
    current_user: CurrentUser,
) -> list[EpicPublic]:
    tasks = _service.list_epics(session, project_id, current_user)
    return [_task_to_epic_public(session, t) for t in tasks]


@router.get("/epics/{epic_id}", response_model=EpicWithTasksPublic)
def get_epic(
    session: SessionDep,
    epic_id: uuid.UUID,
    current_user: CurrentUser,
) -> EpicWithTasksPublic:
    epic, children = _service.get_epic_with_tasks(session, epic_id, current_user)
    result = EpicWithTasksPublic(
        id=epic.id,
        project_id=epic.project_id,
        board_id=epic.board_id,
        column_id=epic.column_id,
        title=epic.title,
        description=epic.description,
        priority=epic.priority,
        due_date=epic.due_date,
        assignee_id=epic.assignee_id,
        custom_status_id=epic.custom_status_id,
        position=epic.position,
        type=epic.type,
        story_point=epic.story_point,
        sprint_id=epic.sprint_id,
        epic_id=epic.epic_id,
        created_at=epic.created_at,
        updated_at=epic.updated_at,
        child_tasks=[_task_to_public(session, c) for c in children],
    )
    return result


@router.patch("/epics/{epic_id}", response_model=EpicPublic)
def update_epic(
    session: SessionDep,
    epic_id: uuid.UUID,
    data: EpicUpdate,
    current_user: CurrentUser,
) -> EpicPublic:
    task = _service.update_epic(session, epic_id, data, current_user)
    return _task_to_epic_public(session, task)


@router.delete("/epics/{epic_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_epic(
    session: SessionDep,
    epic_id: uuid.UUID,
    current_user: CurrentUser,
) -> None:
    _service.delete_epic(session, epic_id, current_user)


@router.get("/epics/{epic_id}/progress", response_model=EpicProgressPublic)
def get_epic_progress(
    session: SessionDep,
    epic_id: uuid.UUID,
    current_user: CurrentUser,
) -> EpicProgressPublic:
    progress = _service.get_epic_progress(session, epic_id, current_user)
    return EpicProgressPublic(**progress)


@router.post("/epics/{epic_id}/tasks/{task_id}", response_model=dict)
def add_task_to_epic(
    session: SessionDep,
    epic_id: uuid.UUID,
    task_id: uuid.UUID,
    current_user: CurrentUser,
) -> dict:
    _service.add_task_to_epic(session, epic_id, task_id, current_user)
    return {"success": True}


@router.delete(
    "/epics/{epic_id}/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT
)
def remove_task_from_epic(
    session: SessionDep,
    epic_id: uuid.UUID,
    task_id: uuid.UUID,
    current_user: CurrentUser,
) -> None:
    _service.remove_task_from_epic(session, epic_id, task_id, current_user)
