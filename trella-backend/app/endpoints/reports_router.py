import uuid

from fastapi import APIRouter
from sqlmodel import select, func

from app.core.deps import CurrentUser, SessionDep
from app.models.board_columns_model import BoardColumn
from app.models.boards_model import Board
from app.models.projects_model import Project
from app.models.sprints_model import Sprint
from app.models.tasks_model import Task
from app.models.enums import SprintStatus

router = APIRouter(prefix="/workspaces/{workspace_id}/reports", tags=["reports"])


def _get_project_id(session, workspace_id: uuid.UUID) -> uuid.UUID | None:
    project = session.exec(
        select(Project).where(Project.workspace_id == workspace_id).order_by(Project.created_at)
    ).first()
    return project.id if project else None


@router.get("/sprint-velocity")
def get_sprint_velocity(
    session: SessionDep,
    workspace_id: uuid.UUID,
    current_user: CurrentUser,
) -> dict:
    """Committed vs completed story points per completed sprint."""
    project_id = _get_project_id(session, workspace_id)
    if not project_id:
        return {"sprints": []}

    done_cols = set(session.exec(
        select(BoardColumn.id)
        .join(Board, BoardColumn.board_id == Board.id)
        .join(Project, Board.project_id == Project.id)
        .where(Project.workspace_id == workspace_id, BoardColumn.status_key == "DONE")
    ).all())

    sprints = list(session.exec(
        select(Sprint)
        .where(Sprint.project_id == project_id, Sprint.status == SprintStatus.COMPLETED)
        .order_by(Sprint.start_date)
    ).all())

    result = []
    for sprint in sprints:
        tasks = list(session.exec(
            select(Task).where(Task.sprint_id == sprint.id)
        ).all())
        committed = sum(t.story_point or 0 for t in tasks)
        completed = sum(t.story_point or 0 for t in tasks if t.column_id in done_cols)
        result.append({
            "sprint_id": str(sprint.id),
            "sprint_name": sprint.name,
            "start_date": sprint.start_date.isoformat() if sprint.start_date else None,
            "end_date": sprint.end_date.isoformat() if sprint.end_date else None,
            "committed": committed,
            "completed": completed,
            "task_count": len(tasks),
        })

    return {"sprints": result}


@router.get("/sprint-burndown/{sprint_id}")
def get_sprint_burndown(
    session: SessionDep,
    workspace_id: uuid.UUID,
    sprint_id: uuid.UUID,
    current_user: CurrentUser,
) -> dict:
    """Task counts by status for a specific sprint (snapshot — not historical)."""
    done_cols = set(session.exec(
        select(BoardColumn.id)
        .join(Board, BoardColumn.board_id == Board.id)
        .join(Project, Board.project_id == Project.id)
        .where(Project.workspace_id == workspace_id, BoardColumn.status_key == "DONE")
    ).all())
    in_progress_cols = set(session.exec(
        select(BoardColumn.id)
        .join(Board, BoardColumn.board_id == Board.id)
        .join(Project, Board.project_id == Project.id)
        .where(Project.workspace_id == workspace_id, BoardColumn.status_key == "IN_PROGRESS")
    ).all())

    sprint = session.get(Sprint, sprint_id)
    if not sprint:
        return {"sprint": None, "tasks": []}

    tasks = list(session.exec(select(Task).where(Task.sprint_id == sprint_id)).all())

    done = [t for t in tasks if t.column_id in done_cols]
    in_progress = [t for t in tasks if t.column_id in in_progress_cols]
    todo = [t for t in tasks if t.column_id not in done_cols and t.column_id not in in_progress_cols]

    return {
        "sprint": {
            "id": str(sprint.id),
            "name": sprint.name,
            "start_date": sprint.start_date.isoformat() if sprint.start_date else None,
            "end_date": sprint.end_date.isoformat() if sprint.end_date else None,
            "status": sprint.status,
        },
        "todo": len(todo),
        "in_progress": len(in_progress),
        "done": len(done),
        "total": len(tasks),
        "total_points": sum(t.story_point or 0 for t in tasks),
        "done_points": sum(t.story_point or 0 for t in done),
    }


@router.get("/completion-trend")
def get_completion_trend(
    session: SessionDep,
    workspace_id: uuid.UUID,
    current_user: CurrentUser,
) -> dict:
    """Tasks created vs completed grouped by sprint."""
    project_id = _get_project_id(session, workspace_id)
    if not project_id:
        return {"sprints": []}

    done_cols = set(session.exec(
        select(BoardColumn.id)
        .join(Board, BoardColumn.board_id == Board.id)
        .join(Project, Board.project_id == Project.id)
        .where(Project.workspace_id == workspace_id, BoardColumn.status_key == "DONE")
    ).all())

    sprints = list(session.exec(
        select(Sprint)
        .where(Sprint.project_id == project_id)
        .order_by(Sprint.start_date)
    ).all())

    result = []
    for sprint in sprints:
        tasks = list(session.exec(select(Task).where(Task.sprint_id == sprint.id)).all())
        result.append({
            "sprint_name": sprint.name,
            "status": sprint.status,
            "created": len(tasks),
            "completed": sum(1 for t in tasks if t.column_id in done_cols),
        })

    return {"sprints": result}
