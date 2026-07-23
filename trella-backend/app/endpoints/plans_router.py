import uuid

from fastapi import APIRouter, status

from app.core.deps import CurrentUser, SessionDep
from app.models.plans_model import Plan
from app.models.tasks_model import Task
from app.schemas.epics_schema import EpicPublic
from app.schemas.plans_schema import (
    PlanCreate,
    PlanPublic,
    PlanUpdate,
    PlanWithBoardsPublic,
)
from app.services.plans_service import PlansService

router = APIRouter(tags=["plans"])

_service = PlansService()


def _task_to_epic_public(task: Task) -> EpicPublic:
    return EpicPublic(
        id=task.id,
        project_id=task.project_id,
        board_id=task.board_id,
        column_id=task.column_id,
        title=task.title,
        description=task.description,
        priority=task.priority,
        due_date=task.due_date,
        start_date=task.start_date,
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


def _plan_to_public_with_boards(
    plan: Plan, board_ids: list[uuid.UUID]
) -> PlanWithBoardsPublic:
    return PlanWithBoardsPublic(
        id=plan.id,
        workspace_id=plan.workspace_id,
        name=plan.name,
        description=plan.description,
        status=plan.status,
        created_by=plan.created_by,
        created_at=plan.created_at,
        updated_at=plan.updated_at,
        board_ids=board_ids,
    )


@router.post(
    "/workspaces/{workspace_id}/plans",
    response_model=PlanWithBoardsPublic,
    status_code=status.HTTP_201_CREATED,
)
def create_plan(
    session: SessionDep,
    workspace_id: uuid.UUID,
    data: PlanCreate,
    current_user: CurrentUser,
) -> PlanWithBoardsPublic:
    plan = _service.create_plan(session, workspace_id, data, current_user)
    board_ids = _service.list_board_ids(session, plan.id)
    return _plan_to_public_with_boards(plan, board_ids)


@router.get("/workspaces/{workspace_id}/plans", response_model=list[PlanPublic])
def list_plans(
    session: SessionDep,
    workspace_id: uuid.UUID,
    current_user: CurrentUser,
) -> list[PlanPublic]:
    plans = _service.list_plans(session, workspace_id, current_user)
    return [PlanPublic.model_validate(p) for p in plans]


@router.get("/plans/{plan_id}", response_model=PlanWithBoardsPublic)
def get_plan(
    session: SessionDep,
    plan_id: uuid.UUID,
    current_user: CurrentUser,
) -> PlanWithBoardsPublic:
    plan = _service.get_plan(session, plan_id, current_user)
    board_ids = _service.list_board_ids(session, plan.id)
    return _plan_to_public_with_boards(plan, board_ids)


@router.patch("/plans/{plan_id}", response_model=PlanPublic)
def update_plan(
    session: SessionDep,
    plan_id: uuid.UUID,
    data: PlanUpdate,
    current_user: CurrentUser,
) -> PlanPublic:
    plan = _service.update_plan(session, plan_id, data, current_user)
    return PlanPublic.model_validate(plan)


@router.delete("/plans/{plan_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_plan(
    session: SessionDep,
    plan_id: uuid.UUID,
    current_user: CurrentUser,
) -> None:
    _service.delete_plan(session, plan_id, current_user)


@router.get("/plans/{plan_id}/epics", response_model=list[EpicPublic])
def list_epics_for_plan(
    session: SessionDep,
    plan_id: uuid.UUID,
    current_user: CurrentUser,
) -> list[EpicPublic]:
    tasks = _service.list_epics_for_plan(session, plan_id, current_user)
    return [_task_to_epic_public(t) for t in tasks]
