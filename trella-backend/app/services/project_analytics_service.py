"""Project analytics (Phase 10.2) — deterministic PM signals for the AI Chat.

This is a NORMAL business service, NOT an AI module: it performs **no** AI calls,
holds **no** prompts, and makes **no** decisions. It composes the existing
permission-checked services/repositories (``SprintsService``, ``TasksService``,
``CustomStatusesRepository``) into three read-only, deterministic analytics that
let the AI Chat behave like an experienced project manager:

* :meth:`analyze_sprint`   — progress, commitment, burndown-vs-time, health verdict.
* :meth:`analyze_workload` — per-assignee open load; overloaded / idle flags.
* :meth:`analyze_risk`     — at-risk items (overdue, blocked) + schedule pressure.

There is intentionally **no** ``recommend()``: turning these signals into a
recommendation, report, retrospective, backlog order or ETA is a *decision* and
therefore the AI Chat's job (reasoning), never this deterministic service's.
Every method returns a trimmed, JSON-safe ``dict`` of primitives. Permission
enforcement is inherited from the underlying service calls (each requires
``VIEW_PROJECT_RESOURCE``), so this layer never re-implements authorization.

Phase 7 invariant preserved: analytics are deterministic and AI-free.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, time, timezone
from typing import Any

from fastapi import HTTPException, status
from sqlmodel import Session

from app.models.enums import CanonicalStatus, SprintStatus
from app.models.sprints_model import Sprint
from app.models.tasks_model import Task
from app.models.users_model import User
from app.repositories.custom_statuses_repository import CustomStatusesRepository
from app.repositories.projects_repository import ProjectsRepository
from app.services.sprints_service import SprintsService
from app.services.tasks_service import TasksService

# ponytail: deterministic thresholds for the workload/health heuristics. These
# are simple, transparent knobs — not tuned models. Ceiling: fixed team-agnostic
# limits. Upgrade path = per-project config when a workspace needs its own.
OVERLOADED_TASK_COUNT = 5  # an assignee with MORE open tasks than this is "overloaded"
SCHEDULE_AT_RISK_RATIO = (
    0.5  # done < ratio * time-elapsed → at_risk; below that → off_track
)

# ponytail: at-risk lists are display signals, not exports — cap them so a huge
# backlog can't balloon the JSON payload. Ceiling: first 50 by scan order.
# Upgrade path = pagination when the chat needs to page through more.
_MAX_RISK_ITEMS = 50


def _iso(value: date | datetime | None) -> str | None:
    """ISO-8601 string for a date/datetime, or None. JSON-safe."""
    return value.isoformat() if value is not None else None


def _as_date(value: date | datetime | None) -> date | None:
    """Normalize a date-or-datetime to a plain ``date`` (or None)."""
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date()
    return value


def _as_utc_datetime(value: date | datetime | None) -> datetime | None:
    """Normalize to a tz-aware UTC datetime (or None).

    ponytail: Sprint dates are stored as ``date`` and task due dates as tz-aware
    ``datetime``, but SQLite round-trips can drop tzinfo. Treat naive values and
    bare dates as UTC midnight so the elapsed/overdue math never mixes naive and
    aware datetimes. Ceiling: assumes UTC when tzinfo is missing.
    """
    if value is None:
        return None
    if isinstance(value, datetime):
        dt = value
    else:
        dt = datetime.combine(value, time.min)
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


class ProjectAnalyticsService:
    """Deterministic, AI-free project analytics composed from existing services."""

    def __init__(
        self,
        sprints_service: SprintsService | None = None,
        tasks_service: TasksService | None = None,
        custom_statuses_repo: CustomStatusesRepository | None = None,
        projects_repo: ProjectsRepository | None = None,
    ) -> None:
        self._sprints = sprints_service or SprintsService()
        self._tasks = tasks_service or TasksService()
        self._statuses = custom_statuses_repo or CustomStatusesRepository()
        self._projects = projects_repo or ProjectsRepository()

    # ------------------------------------------------------------------ #
    # Internal helpers (deterministic, permission-inheriting)            #
    # ------------------------------------------------------------------ #
    def _workspace_id(self, session: Session, project_id: uuid.UUID) -> uuid.UUID:
        """Resolve the owning workspace for a project (already perm-checked upstream)."""
        project = self._projects.get(session, project_id)
        if project is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Project not found",
            )
        return project.workspace_id

    def _canonical_map(
        self, session: Session, workspace_id: uuid.UUID
    ) -> dict[uuid.UUID, str | None]:
        """Map custom_status_id -> canonical status for a workspace."""
        return {
            cs.id: cs.canonical_status
            for cs in self._statuses.list_by_workspace(session, workspace_id)
        }

    @staticmethod
    def _canonical_of(cmap: dict[uuid.UUID, str | None], task: Task) -> str | None:
        """Canonical status of a task via its custom_status_id, or None."""
        if task.custom_status_id is None:
            return None
        return cmap.get(task.custom_status_id)

    def _gather_scope(
        self,
        session: Session,
        user: User,
        project_id: uuid.UUID | None,
        sprint_id: uuid.UUID | None,
    ) -> tuple[dict[str, str], uuid.UUID, list[Task]] | None:
        """Resolve (scope, workspace_id, tasks) for exactly one of project/sprint.

        Returns None when neither or both scope args are given (caller maps that
        to ``{"error": "invalid_args"}``). All reads go through permission-checked
        service calls, so authorization is inherited — never re-implemented here.
        """
        if (project_id is None) == (sprint_id is None):
            return None
        if sprint_id is not None:
            sprint = self._sprints.get_sprint(session, sprint_id, user)
            pid = sprint.project_id
            tasks: list[Task] = []
            for row in self._sprints.list_sprints_with_tasks(session, pid, user):
                if row["sprint"].id == sprint_id:
                    tasks = list(row["tasks"])
                    break
            workspace_id = self._workspace_id(session, pid)
            return {"type": "sprint", "id": str(sprint_id)}, workspace_id, tasks
        # project scope: union of all sprint tasks + backlog, de-duped by id.
        # ponytail: reuses the same perm-checked endpoints as the AI task tools;
        # ceiling matches theirs (no board tasks outside sprints/backlog).
        assert project_id is not None  # exactly-one-of guarantees this branch
        seen: dict[uuid.UUID, Task] = {}
        for row in self._sprints.list_sprints_with_tasks(session, project_id, user):
            for task in row["tasks"]:
                seen[task.id] = task
        for task in self._tasks.list_backlog(session, project_id, user):
            seen[task.id] = task
        workspace_id = self._workspace_id(session, project_id)
        return (
            {"type": "project", "id": str(project_id)},
            workspace_id,
            list(seen.values()),
        )

    @staticmethod
    def _expected_progress(sprint: Sprint) -> float | None:
        """Fraction of sprint time elapsed [0,1] for ACTIVE sprints, else None."""
        if sprint.status != SprintStatus.ACTIVE.value:
            return None
        start = _as_utc_datetime(sprint.start_date)
        end = _as_utc_datetime(sprint.end_date)
        if start is None or end is None or end <= start:
            return None
        now = datetime.now(timezone.utc)
        frac = (now - start).total_seconds() / (end - start).total_seconds()
        return min(1.0, max(0.0, frac))

    def _sprint_counts(
        self, session: Session, sprint_id: uuid.UUID, project_id: uuid.UUID, user: User
    ) -> tuple[int, int, int]:
        """(done, in_progress, todo) for a sprint; zeros when the row is absent."""
        for row in self._sprints.list_sprints_with_tasks(session, project_id, user):
            if row["sprint"].id == sprint_id:
                return (
                    int(row["done_count"]),
                    int(row["in_progress_count"]),
                    int(row["todo_count"]),
                )
        return 0, 0, 0

    @staticmethod
    def _fraction_done(
        total_points: int, completed_points: int, done: int, total_tasks: int
    ) -> float:
        """Completion fraction: points when available, else task-based, else 1.0."""
        if total_points > 0:
            return completed_points / total_points
        if total_tasks > 0:
            return done / total_tasks
        return 1.0

    def analyze_sprint(
        self, session: Session, sprint_id: uuid.UUID, user: User
    ) -> dict[str, Any]:
        """Return deterministic progress/health signals for one sprint.

        Shape: ``{sprint: {id,name,status,start_date,end_date}, tasks: {total,
        done,in_progress,todo}, commitment: {total_points,completed_points,
        completion_pct}, schedule: {days_remaining|null}, health: str}`` where
        ``health`` ∈ {``on_track``,``at_risk``,``off_track``}. No AI, no advice.
        """
        sprint = self._sprints.get_sprint(session, sprint_id, user)
        project_id = sprint.project_id

        insights = self._sprints.get_sprint_insights(
            session, project_id, sprint_id, user
        )
        commitment = insights.get("commitment", {})
        total_points = int(commitment.get("total_points", 0) or 0)
        completed_points = int(commitment.get("completed_points", 0) or 0)

        done, in_progress, todo = self._sprint_counts(
            session, sprint_id, project_id, user
        )
        total_tasks = done + in_progress + todo

        fraction_done = self._fraction_done(
            total_points, completed_points, done, total_tasks
        )

        end_d = _as_date(sprint.end_date)
        days_remaining = (end_d - date.today()).days if end_d is not None else None

        expected = self._expected_progress(sprint)

        if total_tasks == 0 and total_points == 0:
            health = "on_track"
        elif expected is None:
            health = "on_track" if fraction_done >= 1.0 else "at_risk"
        elif fraction_done >= expected:
            health = "on_track"
        elif fraction_done >= expected * SCHEDULE_AT_RISK_RATIO:
            health = "at_risk"
        else:
            health = "off_track"

        return {
            "sprint": {
                "id": str(sprint.id),
                "name": sprint.name,
                "status": sprint.status,
                "start_date": _iso(sprint.start_date),
                "end_date": _iso(sprint.end_date),
            },
            "tasks": {
                "total": total_tasks,
                "done": done,
                "in_progress": in_progress,
                "todo": todo,
            },
            "commitment": {
                "total_points": total_points,
                "completed_points": completed_points,
                "completion_pct": round(fraction_done * 100, 1),
            },
            "schedule": {"days_remaining": days_remaining},
            "health": health,
        }

    def analyze_workload(
        self,
        session: Session,
        user: User,
        *,
        project_id: uuid.UUID | None = None,
        sprint_id: uuid.UUID | None = None,
    ) -> dict[str, Any]:
        """Return per-assignee OPEN (non-done) load over a project or one sprint.

        Exactly one of ``project_id`` / ``sprint_id`` must be given. Shape:
        ``{scope: {...}, assignees: [{assignee_id|null, open_tasks, open_points,
        overloaded: bool}], unassigned_open: int, idle: [assignee_id...]}``.
        Deterministic flags only — balancing decisions are the chat's job.
        """
        gathered = self._gather_scope(session, user, project_id, sprint_id)
        if gathered is None:
            return {"error": "invalid_args"}
        scope, workspace_id, tasks = gathered
        cmap = self._canonical_map(session, workspace_id)
        done_value = CanonicalStatus.DONE.value

        # ponytail: only assignees that actually appear on a scope task are
        # considered; there is no full-roster join here. Ceiling = members with
        # zero tasks are invisible. Upgrade path = a project-member roster join.
        seen_assignees: set[uuid.UUID] = set()
        open_by_assignee: dict[uuid.UUID, dict[str, int]] = {}
        unassigned_open = 0

        for task in tasks:
            is_open = self._canonical_of(cmap, task) != done_value
            assignee = task.assignee_id
            if assignee is not None:
                seen_assignees.add(assignee)
            if not is_open:
                continue
            if assignee is None:
                unassigned_open += 1
                continue
            bucket = open_by_assignee.setdefault(
                assignee, {"open_tasks": 0, "open_points": 0}
            )
            bucket["open_tasks"] += 1
            bucket["open_points"] += task.story_point or 0

        assignees: list[dict[str, Any]] = [
            {
                "assignee_id": str(aid),
                "open_tasks": bucket["open_tasks"],
                "open_points": bucket["open_points"],
                "overloaded": bucket["open_tasks"] > OVERLOADED_TASK_COUNT,
            }
            for aid, bucket in open_by_assignee.items()
        ]
        # Sort by open load desc; break ties by id for a stable, deterministic order.
        assignees.sort(key=lambda a: (-a["open_tasks"], a["assignee_id"]))

        idle = sorted(str(aid) for aid in seen_assignees if aid not in open_by_assignee)

        return {
            "scope": scope,
            "assignees": assignees,
            "unassigned_open": unassigned_open,
            "idle": idle,
        }

    def analyze_risk(
        self,
        session: Session,
        user: User,
        *,
        project_id: uuid.UUID | None = None,
        sprint_id: uuid.UUID | None = None,
    ) -> dict[str, Any]:
        """Return deterministic at-risk signals over a project or one sprint.

        Exactly one of ``project_id`` / ``sprint_id`` must be given. Shape:
        ``{scope: {...}, overdue: [{id,title,issue_key,due_date}], blocked:
        [{id,title,issue_key}], counts: {overdue,blocked}, schedule_pressure:
        str|null}``. Flags facts (overdue/blocked/behind burndown); it does not
        predict or advise — that is the chat's reasoning job.
        """
        gathered = self._gather_scope(session, user, project_id, sprint_id)
        if gathered is None:
            return {"error": "invalid_args"}
        scope, workspace_id, tasks = gathered
        cmap = self._canonical_map(session, workspace_id)
        done_value = CanonicalStatus.DONE.value
        pending_value = CanonicalStatus.PENDING.value
        now = datetime.now(timezone.utc)

        overdue: list[dict[str, Any]] = []
        blocked: list[dict[str, Any]] = []
        for task in tasks:
            canonical = self._canonical_of(cmap, task)
            due = _as_utc_datetime(task.due_date)
            if (
                due is not None
                and due < now
                and canonical != done_value
                and len(overdue) < _MAX_RISK_ITEMS
            ):
                overdue.append(
                    {
                        "id": str(task.id),
                        "title": task.title,
                        "issue_key": task.issue_key,
                        "due_date": _iso(task.due_date),
                    }
                )
            if canonical == pending_value and len(blocked) < _MAX_RISK_ITEMS:
                blocked.append(
                    {
                        "id": str(task.id),
                        "title": task.title,
                        "issue_key": task.issue_key,
                    }
                )

        schedule_pressure: str | None = None
        if scope["type"] == "sprint" and sprint_id is not None:
            sprint = self._sprints.get_sprint(session, sprint_id, user)
            expected = self._expected_progress(sprint)
            if expected is not None:
                pid = sprint.project_id
                insights = self._sprints.get_sprint_insights(
                    session, pid, sprint_id, user
                )
                commitment = insights.get("commitment", {})
                total_points = int(commitment.get("total_points", 0) or 0)
                completed_points = int(commitment.get("completed_points", 0) or 0)
                done, in_progress, todo = self._sprint_counts(
                    session, sprint_id, pid, user
                )
                fraction_done = self._fraction_done(
                    total_points, completed_points, done, done + in_progress + todo
                )
                schedule_pressure = "behind" if fraction_done < expected else "on_track"

        return {
            "scope": scope,
            "overdue": overdue,
            "blocked": blocked,
            "counts": {"overdue": len(overdue), "blocked": len(blocked)},
            "schedule_pressure": schedule_pressure,
        }
