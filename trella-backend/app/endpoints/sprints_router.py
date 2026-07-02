import uuid

from fastapi import APIRouter, HTTPException, status
from sqlmodel import select

from app.core.deps import CurrentUser, SessionDep
from app.models.projects_model import Project
from app.repositories.custom_statuses_repository import CustomStatusesRepository
from app.schemas.sprints_schema import (
    SprintComplete,
    SprintCreate,
    SprintInsights,
    SprintPublic,
    SprintStart,
    SprintUpdate,
    SprintWithTasks,
)
from app.schemas.tasks_schema import CustomStatusEmbed, TaskPublic
from app.services.sprints_service import SprintsService

router = APIRouter(tags=["sprints"])

_service = SprintsService()
_cs_repo = CustomStatusesRepository()


def _task_to_public(session: SessionDep, task) -> TaskPublic:
    custom_status: CustomStatusEmbed | None = None
    if task.custom_status_id is not None:
        cs = _cs_repo.get(session, task.custom_status_id)
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
        type=getattr(task, "type", "TASK") or "TASK",
        story_point=getattr(task, "story_point", None),
        sprint_id=getattr(task, "sprint_id", None),
        epic_id=getattr(task, "epic_id", None),
        parent_id=getattr(task, "parent_id", None),
        issue_key=getattr(task, "issue_key", None),
        created_at=task.created_at,
        updated_at=task.updated_at,
    )


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


@router.get("/projects/{project_id}/sprints", response_model=list[SprintWithTasks])
def list_sprints(
    session: SessionDep,
    project_id: uuid.UUID,
    current_user: CurrentUser,
) -> list[SprintWithTasks]:
    items = _service.list_sprints_with_tasks(session, project_id, current_user)
    result = []
    for item in items:
        sprint = item["sprint"]
        tasks = [_task_to_public(session, t) for t in item["tasks"]]
        result.append(
            SprintWithTasks(
                id=sprint.id,
                project_id=sprint.project_id,
                name=sprint.name,
                goal=sprint.goal,
                status=sprint.status,
                start_date=sprint.start_date,
                end_date=sprint.end_date,
                created_at=sprint.created_at,
                updated_at=sprint.updated_at,
                tasks=tasks,
                todo_count=item["todo_count"],
                in_progress_count=item["in_progress_count"],
                done_count=item["done_count"],
            )
        )
    return result


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
    data: SprintStart,
    current_user: CurrentUser,
) -> SprintPublic:
    sprint = _service.start_sprint(session, sprint_id, data, current_user)
    return SprintPublic.model_validate(sprint)


@router.post("/sprints/{sprint_id}/complete", response_model=SprintPublic)
def complete_sprint(
    session: SessionDep,
    sprint_id: uuid.UUID,
    data: SprintComplete,
    current_user: CurrentUser,
) -> SprintPublic:
    sprint = _service.complete_sprint(session, sprint_id, data, current_user)
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


@router.get(
    "/projects/{project_id}/sprints/{sprint_id}/insights",
    response_model=SprintInsights,
)
def get_sprint_insights(
    session: SessionDep,
    project_id: uuid.UUID,
    sprint_id: uuid.UUID,
    current_user: CurrentUser,
) -> SprintInsights:
    data = _service.get_sprint_insights(session, project_id, sprint_id, current_user)
    return SprintInsights(
        commitment=data["commitment"],
        work_types=data["work_types"],
    )


def _resolve_project_from_workspace(session: SessionDep, workspace_id: uuid.UUID) -> uuid.UUID:
    project = session.exec(select(Project).where(Project.workspace_id == workspace_id)).first()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No project found for this workspace")
    return project.id


@router.get("/workspaces/{workspace_id}/sprints", response_model=list[SprintWithTasks])
def list_workspace_sprints(
    session: SessionDep,
    workspace_id: uuid.UUID,
    current_user: CurrentUser,
) -> list[SprintWithTasks]:
    project_id = _resolve_project_from_workspace(session, workspace_id)
    items = _service.list_sprints_with_tasks(session, project_id, current_user)
    result = []
    for item in items:
        sprint = item["sprint"]
        tasks = [_task_to_public(session, t) for t in item["tasks"]]
        result.append(
            SprintWithTasks(
                id=sprint.id,
                project_id=sprint.project_id,
                name=sprint.name,
                goal=sprint.goal,
                status=sprint.status,
                start_date=sprint.start_date,
                end_date=sprint.end_date,
                created_at=sprint.created_at,
                updated_at=sprint.updated_at,
                tasks=tasks,
                todo_count=item["todo_count"],
                in_progress_count=item["in_progress_count"],
                done_count=item["done_count"],
            )
        )
    return result


@router.post(
    "/workspaces/{workspace_id}/sprints",
    response_model=SprintPublic,
    status_code=status.HTTP_201_CREATED,
)
def create_workspace_sprint(
    session: SessionDep,
    workspace_id: uuid.UUID,
    data: SprintCreate,
    current_user: CurrentUser,
) -> SprintPublic:
    project_id = _resolve_project_from_workspace(session, workspace_id)
    sprint = _service.create_sprint(session, project_id, data, current_user)
    return SprintPublic.model_validate(sprint)
