import uuid

from fastapi import APIRouter, status

from app.core.deps import CurrentUser, SessionDep
from app.repositories.board_columns_repository import BoardColumnsRepository
from app.repositories.boards_repository import BoardsRepository
from app.repositories.projects_repository import ProjectsRepository
from app.schemas.board_columns_schema import (
    ColumnCreate,
    ColumnPublic,
    ColumnReorder,
    ColumnUpdate,
)
from app.schemas.tasks_schema import TaskCreate, TaskPublic
from app.services.board_columns_service import BoardColumnsService
from app.services.organization_members_service import OrganizationMemberService
from app.services.tasks_service import TasksService

router = APIRouter(prefix="/boards/{board_id}/columns", tags=["columns"])

_service = BoardColumnsService()
_columns_repo = BoardColumnsRepository()
_boards_repo = BoardsRepository()
_projects_repo = ProjectsRepository()
_org_member_service = OrganizationMemberService()


@router.get("", response_model=list[ColumnPublic])
def list_columns(
    session: SessionDep,
    board_id: uuid.UUID,
    current_user: CurrentUser,
) -> list[ColumnPublic]:
    board = _boards_repo.get(session, board_id)
    if board is None:
        from fastapi import HTTPException

        raise HTTPException(status_code=404, detail="Board not found")
    project = _projects_repo.get(session, board.project_id)
    if project is not None:
        _org_member_service.assert_member(
            session, project.workspace_id, current_user.id
        )
    columns = _columns_repo.list_by_board(session, board_id)
    return [ColumnPublic.model_validate(col) for col in columns]


@router.post("", response_model=ColumnPublic, status_code=status.HTTP_201_CREATED)
def create_column(
    session: SessionDep,
    board_id: uuid.UUID,
    data: ColumnCreate,
    current_user: CurrentUser,
) -> ColumnPublic:
    column = _service.create_column(session, board_id, data, current_user)
    return ColumnPublic.model_validate(column)


@router.patch("/reorder", response_model=list[ColumnPublic])
def reorder_columns(
    session: SessionDep,
    board_id: uuid.UUID,
    data: ColumnReorder,
    current_user: CurrentUser,
) -> list[ColumnPublic]:
    columns = _service.reorder_columns(session, board_id, data.items, current_user)
    return [ColumnPublic.model_validate(column) for column in columns]


@router.patch("/{column_id}", response_model=ColumnPublic)
def update_column(
    session: SessionDep,
    board_id: uuid.UUID,
    column_id: uuid.UUID,
    data: ColumnUpdate,
    current_user: CurrentUser,
) -> ColumnPublic:
    column = _service.update_column(session, board_id, column_id, data, current_user)
    return ColumnPublic.model_validate(column)


@router.delete("/{column_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_column(
    session: SessionDep,
    board_id: uuid.UUID,
    column_id: uuid.UUID,
    current_user: CurrentUser,
) -> None:
    _service.delete_column(session, board_id, column_id, current_user)


@router.post(
    "/{column_id}/tasks", response_model=TaskPublic, status_code=status.HTTP_201_CREATED
)
def create_task(
    session: SessionDep,
    board_id: uuid.UUID,
    column_id: uuid.UUID,
    data: TaskCreate,
    current_user: CurrentUser,
) -> TaskPublic:
    from app.repositories.custom_statuses_repository import CustomStatusesRepository
    from app.schemas.tasks_schema import CustomStatusEmbed

    task = TasksService().create_task(session, board_id, column_id, data, current_user)

    custom_status_embed: CustomStatusEmbed | None = None
    if task.custom_status_id is not None:
        cs = CustomStatusesRepository().get(session, task.custom_status_id)
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
        type=getattr(task, "type", "TASK") or "TASK",
        story_point=getattr(task, "story_point", None),
        sprint_id=getattr(task, "sprint_id", None),
        epic_id=getattr(task, "epic_id", None),
        parent_id=getattr(task, "parent_id", None),
        issue_key=getattr(task, "issue_key", None),
        created_at=task.created_at,
        updated_at=task.updated_at,
    )
