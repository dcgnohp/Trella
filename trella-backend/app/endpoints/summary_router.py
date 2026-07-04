import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Query
from sqlmodel import select, func

from app.core.deps import CurrentUser, SessionDep
from app.models.activity_logs_model import ActivityLog
from app.models.board_columns_model import BoardColumn
from app.models.boards_model import Board
from app.models.projects_model import Project
from app.models.tasks_model import Task
from app.models.users_model import User

router = APIRouter(prefix="/workspaces/{workspace_id}/summary", tags=["summary"])


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _workspace_task_ids(session: SessionDep, workspace_id: uuid.UUID) -> list[uuid.UUID]:
    """Return all task IDs belonging to this workspace via boards -> tasks join."""
    stmt = (
        select(Task.id)
        .join(Board, Task.board_id == Board.id)
        .join(Project, Board.project_id == Project.id)
        .where(Project.workspace_id == workspace_id)
    )
    return list(session.exec(stmt).all())


@router.get("/stats")
def get_stats(
    session: SessionDep,
    workspace_id: uuid.UUID,
    current_user: CurrentUser,
) -> dict:
    now = _utcnow()
    week_ago = now - timedelta(days=7)
    week_ahead = now + timedelta(days=7)

    # Get columns for "DONE" status
    done_columns_stmt = (
        select(BoardColumn.id)
        .join(Board, BoardColumn.board_id == Board.id)
        .join(Project, Board.project_id == Project.id)
        .where(
            Project.workspace_id == workspace_id,
            BoardColumn.status_key == "DONE",
        )
    )
    done_col_ids = set(session.exec(done_columns_stmt).all())

    base = (
        select(Task)
        .join(Board, Task.board_id == Board.id)
        .join(Project, Board.project_id == Project.id)
        .where(Project.workspace_id == workspace_id)
    )

    all_tasks = list(session.exec(base).all())

    completed_7d = sum(
        1 for t in all_tasks
        if t.column_id in done_col_ids and t.updated_at >= week_ago
    )
    updated_7d = sum(1 for t in all_tasks if t.updated_at >= week_ago)
    created_7d = sum(1 for t in all_tasks if t.created_at >= week_ago)
    due_soon_7d = sum(
        1 for t in all_tasks
        if t.due_date and now <= t.due_date <= week_ahead
    )

    return {
        "completed_7d": completed_7d,
        "updated_7d": updated_7d,
        "created_7d": created_7d,
        "due_soon_7d": due_soon_7d,
    }


@router.get("/status-overview")
def get_status_overview(
    session: SessionDep,
    workspace_id: uuid.UUID,
    current_user: CurrentUser,
) -> dict:
    stmt = (
        select(BoardColumn.status_key, func.count(Task.id).label("cnt"))
        .join(Task, Task.column_id == BoardColumn.id)
        .join(Board, Task.board_id == Board.id)
        .join(Project, Board.project_id == Project.id)
        .where(Project.workspace_id == workspace_id)
        .group_by(BoardColumn.status_key)
    )
    rows = session.exec(stmt).all()

    STATUS_COLORS = {
        "IN_PROGRESS": "hsl(var(--info))",
        "TODO": "hsl(var(--warning))",
        "DONE": "hsl(var(--success-foreground))",
        "PENDING": "hsl(var(--warning))",
    }

    by_status = [
        {
            "status": row.status_key or "TODO",
            "count": row.cnt,
            "color": STATUS_COLORS.get(row.status_key or "TODO", "hsl(var(--muted))"),
        }
        for row in rows
    ]
    total = sum(r["count"] for r in by_status)

    return {"total": total, "by_status": by_status}


def _time_ago(dt: datetime) -> str:
    now = _utcnow()
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    delta = now - dt
    seconds = int(delta.total_seconds())
    if seconds < 60:
        return "just now"
    if seconds < 3600:
        m = seconds // 60
        return f"{m} minute{'s' if m != 1 else ''} ago"
    if seconds < 86400:
        h = seconds // 3600
        return f"{h} hour{'s' if h != 1 else ''} ago"
    d = seconds // 86400
    return f"{d} day{'s' if d != 1 else ''} ago"


@router.get("/activity")
def get_activity(
    session: SessionDep,
    workspace_id: uuid.UUID,
    current_user: CurrentUser,
    limit: int = Query(default=20, le=100),
) -> dict:
    stmt = (
        select(ActivityLog, User, Task)
        .join(User, ActivityLog.actor_id == User.id)
        .outerjoin(Task, ActivityLog.task_id == Task.id)
        .where(ActivityLog.workspace_id == workspace_id)
        .order_by(ActivityLog.created_at.desc())
        .limit(limit)
    )
    rows = session.exec(stmt).all()

    items = []
    for log, user, task in rows:
        field = ""
        if log.new_value:
            keys = list(log.new_value.keys())
            field = keys[0] if keys else log.action

        items.append({
            "user_name": user.full_name or user.email,
            "user_avatar_url": getattr(user, "avatar_url", None),
            "field": field,
            "task_key": task.issue_key if task else None,
            "task_title": task.title if task else None,
            "task_status": task.custom_status_id if task else None,
            "time_ago": _time_ago(log.created_at),
            "created_at": log.created_at.isoformat(),
        })

    return {"items": items}


@router.get("/priority-breakdown")
def get_priority_breakdown(
    session: SessionDep,
    workspace_id: uuid.UUID,
    current_user: CurrentUser,
) -> dict:
    stmt = (
        select(Task.priority, func.count(Task.id).label("cnt"))
        .join(Board, Task.board_id == Board.id)
        .join(Project, Board.project_id == Project.id)
        .where(Project.workspace_id == workspace_id)
        .group_by(Task.priority)
    )
    rows = session.exec(stmt).all()

    priority_order = ["HIGHEST", "HIGH", "MEDIUM", "LOW", "LOWEST"]
    counts = {r.priority: r.cnt for r in rows}

    by_priority = [
        {"priority": p, "count": counts.get(p, 0)}
        for p in priority_order
    ]
    # Add None/unknown
    none_count = counts.get(None, 0) + counts.get("NONE", 0)
    by_priority.append({"priority": "None", "count": none_count})

    return {"by_priority": by_priority}


@router.get("/work-types")
def get_work_types(
    session: SessionDep,
    workspace_id: uuid.UUID,
    current_user: CurrentUser,
) -> dict:
    stmt = (
        select(Task.type, func.count(Task.id).label("cnt"))
        .join(Board, Task.board_id == Board.id)
        .join(Project, Board.project_id == Project.id)
        .where(Project.workspace_id == workspace_id)
        .group_by(Task.type)
    )
    rows = session.exec(stmt).all()

    total = sum(r.cnt for r in rows)
    by_type = [
        {
            "type": r.type or "TASK",
            "count": r.cnt,
            "percentage": round(r.cnt / total * 100, 1) if total > 0 else 0.0,
        }
        for r in rows
    ]
    return {"by_type": by_type}


@router.get("/team-workload")
def get_team_workload(
    session: SessionDep,
    workspace_id: uuid.UUID,
    current_user: CurrentUser,
) -> dict:
    stmt = (
        select(User, func.count(Task.id).label("cnt"))
        .join(Task, Task.assignee_id == User.id)
        .join(Board, Task.board_id == Board.id)
        .join(Project, Board.project_id == Project.id)
        .where(Project.workspace_id == workspace_id)
        .group_by(User.id)
        .order_by(func.count(Task.id).desc())
    )
    rows = session.exec(stmt).all()

    total = sum(r.cnt for r in rows)
    members = [
        {
            "user_id": str(user.id),
            "name": user.full_name or user.email,
            "avatar_url": getattr(user, "avatar_url", None),
            "task_count": cnt,
            "percentage": round(cnt / total * 100, 1) if total > 0 else 0.0,
        }
        for user, cnt in rows
    ]
    return {"members": members}
