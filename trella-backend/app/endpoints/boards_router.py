import uuid

from fastapi import APIRouter, Query, status

from app.core.deps import CurrentUser, SessionDep
from app.repositories.custom_statuses_repository import CustomStatusesRepository
from app.repositories.tasks_repository import TasksRepository
from app.schemas.boards_schema import (
    BoardCreate,
    BoardDetail,
    BoardPublic,
    BoardUpdate,
)
from app.schemas.tasks_schema import CustomStatusEmbed, TaskPublic
from app.services.boards_service import BoardsService

router = APIRouter(prefix="/boards", tags=["boards"])

_service = BoardsService()
_tasks_repo = TasksRepository()
_custom_statuses_repo = CustomStatusesRepository()


def _task_to_public(session: SessionDep, task) -> TaskPublic:
    custom_status_embed: CustomStatusEmbed | None = None
    if task.custom_status_id is not None:
        cs = _custom_statuses_repo.get(session, task.custom_status_id)
        if cs is not None:
            custom_status_embed = CustomStatusEmbed(
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
        custom_status=custom_status_embed,
        position=task.position,
        created_at=task.created_at,
        updated_at=task.updated_at,
    )


@router.post("", response_model=BoardPublic)
def create_board(
    session: SessionDep,
    data: BoardCreate,
    current_user: CurrentUser,
) -> BoardPublic:
    board = _service.create_board(session, data, current_user)
    return _service.to_public(session, board)


@router.get("", response_model=list[BoardPublic])
def list_boards(
    session: SessionDep,
    current_user: CurrentUser,
    org_id: uuid.UUID = Query(alias="orgId"),
) -> list[BoardPublic]:
    boards = _service.list_boards(session, org_id, current_user)
    return [_service.to_public(session, board) for board in boards]


@router.get("/{board_id}", response_model=BoardDetail)
def get_board(
    session: SessionDep,
    board_id: uuid.UUID,
    current_user: CurrentUser,
) -> BoardDetail:
    return _service.get_board_detail(session, board_id, current_user)


@router.patch("/{board_id}", response_model=BoardPublic)
def update_board(
    session: SessionDep,
    board_id: uuid.UUID,
    data: BoardUpdate,
    current_user: CurrentUser,
) -> BoardPublic:
    board = _service.update_board(session, board_id, data, current_user)
    return _service.to_public(session, board)


@router.delete("/{board_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_board(
    session: SessionDep,
    board_id: uuid.UUID,
    current_user: CurrentUser,
) -> None:
    _service.delete_board(session, board_id, current_user)


@router.get("/{board_id}/tasks", response_model=list[TaskPublic])
def list_board_tasks(
    session: SessionDep,
    board_id: uuid.UUID,
    current_user: CurrentUser,
) -> list[TaskPublic]:
    _service.get_board(session, board_id, current_user)
    tasks = _tasks_repo.list_by_board(session, board_id)
    return [_task_to_public(session, task) for task in tasks]
