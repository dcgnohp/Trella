"""Unit tests for ``TasksService`` (tasks 12.3 + 12.4).

Cover ``update_task`` (status-change logging + assigned-task-updated
notification) and ``set_assignee`` / ``unset_assignee`` (assignment lifecycle,
validation, no-op rules, notification recipient rules) against a real in-memory
SQLite session.

Why a local ``session`` fixture (not the shared ``tests/services/conftest.py``
one): the ``activity_logs`` table declares genuine PostgreSQL ``JSONB`` columns
which SQLite cannot render, so ``SQLModel.metadata.create_all`` over the FULL
metadata fails. This module therefore creates ONLY the tables ``TasksService``
actually reads/writes (workspaces, users, projects, project_members, boards,
board_columns, custom_statuses, tasks, notifications) and isolates the two
AFTER-commit side-effect collaborators behind tiny in-memory recorder doubles:

- ``_RecordingActivityLogs`` captures every ``record(...)`` call so the test can
  assert WHICH ``ActivityAction`` was logged and with WHAT old/new snapshots
  (the actual ``activity_logs`` row write is a thin repo insert exercised by the
  activity-logs domain's own tests, and cannot run on SQLite).
- ``_RecordingNotifications`` captures every ``emit(...)`` call so the test can
  assert the Property-16 recipient rules (exactly-one / none, never the actor,
  never a ``REMOVED`` user).

Everything else — the Task load, RBAC check (real ``RBACService`` against real
ProjectMember rows), assignee validation, no-op short-circuits, field
application and ``session.commit()`` — runs for real against the SQLite session.
"""

import uuid
from collections.abc import Iterator
from typing import Any

import pytest
from fastapi import HTTPException
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, create_engine

from app.models import SQLModel
from app.models.board_columns_model import BoardColumn
from app.models.boards_model import Board
from app.models.custom_statuses_model import CustomStatus
from app.models.enums import (
    ActivityAction,
    MemberStatus,
    NotificationType,
    ProjectRole,
    UserAccountStatus,
)
from app.models.notifications_model import Notification  # noqa: F401
from app.models.project_members_model import ProjectMember
from app.models.projects_model import Project
from app.models.tasks_model import Task
from app.models.users_model import User
from app.models.workspaces_model import Workspace
from app.models.workspace_members_model import WorkspaceMember  # noqa: F401
from app.models.board_members_model import BoardMember  # noqa: F401
from app.services.tasks_service import TasksService

# Tables TasksService touches (excludes activity_logs — JSONB, not SQLite-able).
# Built from the metadata registry by name (the model modules imported above
# register them) to avoid model ``__table__`` attribute typing noise.
_REQUIRED_TABLE_NAMES = [
    "workspaces",
    "workspace_members",
    "users",
    "projects",
    "project_members",
    "boards",
    "board_members",
    "board_columns",
    "custom_statuses",
    "tasks",
    "notifications",
]


@pytest.fixture
def session() -> Iterator[Session]:
    """Yield a real ``Session`` with only the tables TasksService needs."""
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    tables = [SQLModel.metadata.tables[name] for name in _REQUIRED_TABLE_NAMES]
    SQLModel.metadata.create_all(engine, tables=tables)
    with Session(engine) as db:
        yield db
    SQLModel.metadata.drop_all(engine, tables=tables)


# --------------------------------------------------------------------------- #
# In-memory recorder doubles for the after-commit side-effect collaborators    #
# --------------------------------------------------------------------------- #
class _RecordingActivityLogs:
    """Captures ``record(...)`` calls instead of inserting an activity_logs row."""

    def __init__(self) -> None:
        self.calls: list[dict[str, Any]] = []

    def record(
        self,
        session: Session,
        *,
        workspace_id: uuid.UUID,
        project_id: uuid.UUID,
        task_id: uuid.UUID | None = None,
        actor: User,
        action: ActivityAction | str,
        old_value: dict[str, Any] | None = None,
        new_value: dict[str, Any] | None = None,
    ) -> None:
        self.calls.append(
            {
                "workspace_id": workspace_id,
                "project_id": project_id,
                "task_id": task_id,
                "actor_id": actor.id,
                "action": action,
                "old_value": old_value,
                "new_value": new_value,
            }
        )


class _RecordingNotifications:
    """Captures ``emit(...)`` calls instead of pushing a real notification."""

    def __init__(self) -> None:
        self.calls: list[dict[str, Any]] = []

    def emit(
        self,
        session: Session,
        *,
        recipient_id: uuid.UUID,
        type: NotificationType,
        title: str,
        content: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> None:
        self.calls.append(
            {
                "recipient_id": recipient_id,
                "type": type,
                "title": title,
                "metadata": metadata,
            }
        )


# --------------------------------------------------------------------------- #
# Seed helpers                                                                  #
# --------------------------------------------------------------------------- #
def _user(session: Session, *, removed: bool = False) -> User:
    user = User(
        email=f"{uuid.uuid4().hex}@example.com",
        full_name="Test User",
        hashed_password="x",
        status=(
            UserAccountStatus.REMOVED.value
            if removed
            else UserAccountStatus.ACTIVE.value
        ),
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def _custom_status(
    session: Session,
    workspace_id: uuid.UUID,
    *,
    name: str,
    canonical: str | None = None,
) -> CustomStatus:
    cs = CustomStatus(workspace_id=workspace_id, name=name, canonical_status=canonical)
    session.add(cs)
    session.commit()
    session.refresh(cs)
    return cs


def _add_member(
    session: Session,
    project_id: uuid.UUID,
    user_id: uuid.UUID,
    *,
    role: ProjectRole = ProjectRole.PROJECT_MEMBER,
    status: MemberStatus = MemberStatus.ACTIVE,
) -> None:
    session.add(
        ProjectMember(
            project_id=project_id,
            user_id=user_id,
            project_role=role.value,
            status=status.value,
        )
    )
    session.commit()


def _add_workspace_member(
    session: Session,
    workspace_id: uuid.UUID,
    user_id: uuid.UUID,
    *,
    role: str = "MEMBER",
    status: MemberStatus = MemberStatus.ACTIVE,
) -> None:
    from app.models.workspace_members_model import WorkspaceMember
    session.add(
        WorkspaceMember(
            workspace_id=workspace_id,
            user_id=user_id,
            role=role,
            status=status.value,
        )
    )
    session.commit()


def _make_service(
    activity: _RecordingActivityLogs, notifs: _RecordingNotifications
) -> TasksService:
    return TasksService(
        activity_logs_service=activity,  # type: ignore[arg-type]
        notification_service=notifs,  # type: ignore[arg-type]
    )


def _setup(session: Session) -> tuple[User, Task]:
    """Seed workspace/user/project(member)/board/column/task; return (user, task)."""
    workspace = Workspace(name="Acme")
    session.add(workspace)
    session.commit()
    session.refresh(workspace)

    user = _user(session)
    _add_workspace_member(session, workspace.id, user.id, role="OWNER")

    project = Project(
        workspace_id=workspace.id, name="Web", key="WEB", created_by=user.id
    )
    session.add(project)
    session.commit()
    session.refresh(project)
    _add_member(session, project.id, user.id)

    board = Board(project_id=project.id, title="Sprint 1")
    session.add(board)
    session.commit()
    session.refresh(board)

    column = BoardColumn(board_id=board.id, name="To Do", status_key="todo", position=0)
    session.add(column)
    session.commit()
    session.refresh(column)

    task = Task(
        project_id=project.id,
        board_id=board.id,
        column_id=column.id,
        title="Build login",
        priority="MEDIUM",
        position=0,
    )
    session.add(task)
    session.commit()
    session.refresh(task)
    return user, task


class _Update:
    """Minimal stand-in for the (not-yet-built) ``TaskUpdate`` Pydantic schema."""

    def __init__(self, **fields: Any) -> None:
        self._fields = fields

    def model_dump(self, *, exclude_unset: bool = True) -> dict[str, Any]:
        return dict(self._fields)


# --------------------------------------------------------------------------- #
# update_task (12.3)                                                            #
# --------------------------------------------------------------------------- #
def test_update_task_status_change_logs_and_notifies_assignee(
    session: Session,
) -> None:
    activity, notifs = _RecordingActivityLogs(), _RecordingNotifications()
    service = _make_service(activity, notifs)
    user, task = _setup(session)
    assignee = _user(session)
    _add_workspace_member(session, _workspace_id(session, task), assignee.id)
    _add_member(session, task.project_id, assignee.id)
    service.set_assignee(session, task.id, assignee.id, user)
    activity.calls.clear()
    notifs.calls.clear()

    cs = _custom_status(
        session, _workspace_id(session, task), name="Done", canonical="DONE"
    )

    updated = service.update_task(
        session, task.id, _Update(custom_status_id=cs.id), user
    )

    assert updated.custom_status_id == cs.id
    # Exactly one TASK_STATUS_CHANGED log with correct old/new snapshots.
    status_logs = [
        c for c in activity.calls if c["action"] == ActivityAction.TASK_STATUS_CHANGED
    ]
    assert len(status_logs) == 1
    assert status_logs[0]["old_value"] == {
        "custom_status_id": None,
        "status_name": None,
        "canonical_status": None,
    }
    assert status_logs[0]["new_value"] == {
        "custom_status_id": str(cs.id),
        "status_name": "Done",
        "canonical_status": "DONE",
    }
    # The assignee (not the actor) is notified of the update.
    assert len(notifs.calls) == 1
    assert notifs.calls[0]["recipient_id"] == assignee.id
    assert notifs.calls[0]["type"] == NotificationType.ASSIGNED_TASK_UPDATED


def test_update_task_unchanged_status_writes_no_log(session: Session) -> None:
    activity, notifs = _RecordingActivityLogs(), _RecordingNotifications()
    service = _make_service(activity, notifs)
    user, task = _setup(session)
    cs = _custom_status(session, _workspace_id(session, task), name="Doing")
    # Put the task into the status first (this logs once), then clear.
    service.update_task(session, task.id, _Update(custom_status_id=cs.id), user)
    activity.calls.clear()

    # Re-applying the SAME custom_status_id is a no-op: no status log (Req 6.8).
    service.update_task(session, task.id, _Update(custom_status_id=cs.id), user)
    assert activity.calls == []


def test_update_task_priority_change_notifies_without_status_log(
    session: Session,
) -> None:
    activity, notifs = _RecordingActivityLogs(), _RecordingNotifications()
    service = _make_service(activity, notifs)
    user, task = _setup(session)
    assignee = _user(session)
    _add_workspace_member(session, _workspace_id(session, task), assignee.id)
    _add_member(session, task.project_id, assignee.id)
    service.set_assignee(session, task.id, assignee.id, user)
    activity.calls.clear()
    notifs.calls.clear()

    service.update_task(session, task.id, _Update(priority="HIGH"), user)

    # Priority is a notifiable attribute but is NOT a status change.
    assert all(
        c["action"] != ActivityAction.TASK_STATUS_CHANGED for c in activity.calls
    )
    assert len(notifs.calls) == 1
    assert notifs.calls[0]["type"] == NotificationType.ASSIGNED_TASK_UPDATED


def test_update_task_title_only_no_log_no_notification(session: Session) -> None:
    activity, notifs = _RecordingActivityLogs(), _RecordingNotifications()
    service = _make_service(activity, notifs)
    user, task = _setup(session)
    assignee = _user(session)
    _add_workspace_member(session, _workspace_id(session, task), assignee.id)
    _add_member(session, task.project_id, assignee.id)
    service.set_assignee(session, task.id, assignee.id, user)
    activity.calls.clear()
    notifs.calls.clear()

    updated = service.update_task(session, task.id, _Update(title="Renamed"), user)

    assert updated.title == "Renamed"
    assert len(activity.calls) == 1
    assert activity.calls[0]["action"] == ActivityAction.TASK_UPDATED
    assert notifs.calls == []  # title is not a notifiable attribute


def test_update_task_not_found(session: Session) -> None:
    service = _make_service(_RecordingActivityLogs(), _RecordingNotifications())
    user, _ = _setup(session)
    with pytest.raises(HTTPException) as exc:
        service.update_task(session, uuid.uuid4(), _Update(title="x"), user)
    assert exc.value.status_code == 404
    assert exc.value.detail == "Task not found"


def test_update_task_non_member_forbidden(session: Session) -> None:
    service = _make_service(_RecordingActivityLogs(), _RecordingNotifications())
    _, task = _setup(session)
    outsider = _user(session)  # not a project member
    with pytest.raises(HTTPException) as exc:
        service.update_task(session, task.id, _Update(title="x"), outsider)
    assert exc.value.status_code == 403


# --------------------------------------------------------------------------- #
# set_assignee (12.4)                                                           #
# --------------------------------------------------------------------------- #
def test_set_assignee_sets_logs_and_notifies(session: Session) -> None:
    activity, notifs = _RecordingActivityLogs(), _RecordingNotifications()
    service = _make_service(activity, notifs)
    user, task = _setup(session)
    assignee = _user(session)
    _add_workspace_member(session, _workspace_id(session, task), assignee.id)
    _add_member(session, task.project_id, assignee.id)

    updated = service.set_assignee(session, task.id, assignee.id, user)

    assert updated.assignee_id == assignee.id
    assign_logs = [
        c for c in activity.calls if c["action"] == ActivityAction.TASK_ASSIGNED
    ]
    assert len(assign_logs) == 1
    assert assign_logs[0]["new_value"] == {"assignee_id": str(assignee.id)}
    assert len(notifs.calls) == 1
    assert notifs.calls[0]["recipient_id"] == assignee.id
    assert notifs.calls[0]["type"] == NotificationType.TASK_ASSIGNED


def test_set_assignee_no_op_when_unchanged(session: Session) -> None:
    activity, notifs = _RecordingActivityLogs(), _RecordingNotifications()
    service = _make_service(activity, notifs)
    user, task = _setup(session)
    assignee = _user(session)
    _add_workspace_member(session, _workspace_id(session, task), assignee.id)
    _add_member(session, task.project_id, assignee.id)
    service.set_assignee(session, task.id, assignee.id, user)
    activity.calls.clear()
    notifs.calls.clear()

    # Assigning the SAME user again is a no-op: no log, no notification (Req 17.7).
    service.set_assignee(session, task.id, assignee.id, user)
    assert activity.calls == []
    assert notifs.calls == []


def test_set_assignee_rejects_non_active_workspace_member(session: Session) -> None:
    activity, notifs = _RecordingActivityLogs(), _RecordingNotifications()
    service = _make_service(activity, notifs)
    user, task = _setup(session)
    outsider = _user(session)  # exists, but not a workspace member

    with pytest.raises(HTTPException) as exc:
        service.set_assignee(session, task.id, outsider.id, user)
    assert exc.value.status_code == 400
    assert exc.value.detail == "Assignee must be an active member of the workspace/organization"
    reloaded = session.get(Task, task.id)
    assert reloaded is not None
    assert reloaded.assignee_id is None
    assert activity.calls == []
    assert notifs.calls == []


def test_set_assignee_to_self_logs_without_notification(session: Session) -> None:
    activity, notifs = _RecordingActivityLogs(), _RecordingNotifications()
    service = _make_service(activity, notifs)
    user, task = _setup(session)  # user is an ACTIVE project member

    updated = service.set_assignee(session, task.id, user.id, user)

    assert updated.assignee_id == user.id
    assert any(c["action"] == ActivityAction.TASK_ASSIGNED for c in activity.calls)
    # No self-notification (Req 17.5).
    assert notifs.calls == []


# --------------------------------------------------------------------------- #
# unset_assignee (12.4)                                                         #
# --------------------------------------------------------------------------- #
def test_unset_assignee_clears_logs_and_notifies_previous(
    session: Session,
) -> None:
    activity, notifs = _RecordingActivityLogs(), _RecordingNotifications()
    service = _make_service(activity, notifs)
    user, task = _setup(session)
    assignee = _user(session)
    _add_workspace_member(session, _workspace_id(session, task), assignee.id)
    _add_member(session, task.project_id, assignee.id)
    service.set_assignee(session, task.id, assignee.id, user)
    activity.calls.clear()
    notifs.calls.clear()

    updated = service.unset_assignee(session, task.id, user)

    assert updated.assignee_id is None
    unassign_logs = [
        c for c in activity.calls if c["action"] == ActivityAction.TASK_UNASSIGNED
    ]
    assert len(unassign_logs) == 1
    assert unassign_logs[0]["old_value"] == {"assignee_id": str(assignee.id)}
    assert len(notifs.calls) == 1
    assert notifs.calls[0]["recipient_id"] == assignee.id
    assert notifs.calls[0]["type"] == NotificationType.TASK_UNASSIGNED


def test_unset_assignee_no_op_when_already_unassigned(session: Session) -> None:
    activity, notifs = _RecordingActivityLogs(), _RecordingNotifications()
    service = _make_service(activity, notifs)
    user, task = _setup(session)

    service.unset_assignee(session, task.id, user)
    assert activity.calls == []
    assert notifs.calls == []


def test_unset_assignee_skips_notification_for_removed_user(
    session: Session,
) -> None:
    activity, notifs = _RecordingActivityLogs(), _RecordingNotifications()
    service = _make_service(activity, notifs)
    user, task = _setup(session)
    assignee = _user(session)
    _add_workspace_member(session, _workspace_id(session, task), assignee.id)
    _add_member(session, task.project_id, assignee.id)
    service.set_assignee(session, task.id, assignee.id, user)
    activity.calls.clear()
    notifs.calls.clear()

    # Soft-remove the assignee, then unassign: log is written but the REMOVED
    # user is NOT notified (Req 18.5).
    assignee.status = UserAccountStatus.REMOVED.value
    session.add(assignee)
    session.commit()

    service.unset_assignee(session, task.id, user)
    assert any(c["action"] == ActivityAction.TASK_UNASSIGNED for c in activity.calls)
    assert notifs.calls == []


def _workspace_id(session: Session, task: Task) -> uuid.UUID:
    project = session.get(Project, task.project_id)
    assert project is not None
    return project.workspace_id
