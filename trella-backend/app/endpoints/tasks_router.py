import uuid

from fastapi import APIRouter

from app.core.deps import CurrentUser, SessionDep
from app.models.tasks_model import Task
from app.repositories.custom_statuses_repository import CustomStatusesRepository
from app.schemas.tasks_schema import (
    AssigneeUpdate,
    CustomStatusEmbed,
    StoryPointUpdate,
    TaskPublic,
    TaskUpdate,
)
from app.services.tasks_service import TasksService

router = APIRouter(prefix="/tasks", tags=["tasks"])

_service = TasksService()
_custom_statuses_repo = CustomStatusesRepository()


def _to_public(session: SessionDep, task: Task) -> TaskPublic:
    """Build TaskPublic from a Task model, embedding the denormalized custom_status."""
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
        type=getattr(task, "type", "TASK") or "TASK",
        story_point=getattr(task, "story_point", None),
        sprint_id=getattr(task, "sprint_id", None),
        epic_id=getattr(task, "epic_id", None),
        created_at=task.created_at,
        updated_at=task.updated_at,
    )


@router.patch("/{task_id}", response_model=TaskPublic)
def update_task(
    session: SessionDep,
    task_id: uuid.UUID,
    data: TaskUpdate,
    current_user: CurrentUser,
) -> TaskPublic:
    """Apply a partial update to a Task; raises HTTP 404 if not found."""
    task = _service.update_task(session, task_id, data, current_user)
    return _to_public(session, task)


@router.put("/{task_id}/assignee", response_model=TaskPublic)
def set_assignee(
    session: SessionDep,
    task_id: uuid.UUID,
    data: AssigneeUpdate,
    current_user: CurrentUser,
) -> TaskPublic:
    """Assign a Task to a user; raises HTTP 404 if task not found, HTTP 400 if assignee is not an active project member."""
    task = _service.set_assignee(session, task_id, data.assignee_id, current_user)
    return _to_public(session, task)


@router.delete("/{task_id}/assignee", response_model=TaskPublic)
def unset_assignee(
    session: SessionDep,
    task_id: uuid.UUID,
    current_user: CurrentUser,
) -> TaskPublic:
    """Clear a Task's assignee; raises HTTP 404 if task not found."""
    task = _service.unset_assignee(session, task_id, current_user)
    return _to_public(session, task)


@router.patch("/{task_id}/story-point", response_model=TaskPublic)
def update_story_point(
    session: SessionDep,
    task_id: uuid.UUID,
    data: StoryPointUpdate,
    current_user: CurrentUser,
) -> TaskPublic:
    """Update the story point estimate for a task."""
    task = _service.update_story_point(session, task_id, data.story_point, current_user)
    return _to_public(session, task)


backlog_router = APIRouter(tags=["backlog"])


@backlog_router.get("/projects/{project_id}/backlog", response_model=list[TaskPublic])
def get_backlog(
    session: SessionDep,
    project_id: uuid.UUID,
    current_user: CurrentUser,
) -> list[TaskPublic]:
    """Return all tasks not assigned to a sprint (backlog)."""
    tasks = _service.list_backlog(session, project_id, current_user)
    return [_to_public(session, t) for t in tasks]
