"""Unit tests for ``EpicsService`` update path.

Regression coverage for the date-field update: ``update_epic`` writes the
changed fields into the ``activity_logs.new_value`` JSON column, so ``datetime``
values (start_date / due_date) must be stringified before logging — otherwise
the commit raises ``TypeError: Object of type datetime is not JSON serializable``.

Uses the real ``ActivityLogsService`` (not a recording double) against the
shared in-memory SQLite session so the JSON serialization actually runs.
"""

import uuid
from datetime import datetime, timezone

from sqlmodel import Session, select

from app.models.board_columns_model import BoardColumn
from app.models.boards_model import Board
from app.models.enums import MemberStatus, ProjectRole, TaskType
from app.models.organization_members_model import OrganizationMember
from app.models.organizations_model import Organization
from app.models.project_members_model import ProjectMember
from app.models.projects_model import Project
from app.models.tasks_model import Task
from app.models.users_model import User
from app.schemas.epics_schema import EpicUpdate
from app.services.epics_service import EpicsService


def _setup(session: Session) -> tuple[User, Task]:
    user = User(
        email=f"{uuid.uuid4().hex}@example.com",
        full_name="Test User",
        hashed_password="x",
    )
    session.add(user)
    session.commit()
    session.refresh(user)

    org = Organization(name="Acme")
    session.add(org)
    session.commit()
    session.refresh(org)
    session.add(
        OrganizationMember(
            workspace_id=org.id, user_id=user.id, role="OWNER", status="ACTIVE"
        )
    )
    session.commit()

    project = Project(
        workspace_id=org.id,
        name="Web",
        key=f"P{uuid.uuid4().hex[:6].upper()}",
        created_by=user.id,
    )
    session.add(project)
    session.commit()
    session.refresh(project)
    session.add(
        ProjectMember(
            project_id=project.id,
            user_id=user.id,
            project_role=ProjectRole.PROJECT_MEMBER.value,
            status=MemberStatus.ACTIVE.value,
        )
    )
    session.commit()

    board = Board(project_id=project.id, title="Board")
    session.add(board)
    session.commit()
    session.refresh(board)
    column = BoardColumn(board_id=board.id, name="To Do", position=0, status_key="TODO")
    session.add(column)
    session.commit()
    session.refresh(column)

    epic = Task(
        project_id=project.id,
        board_id=board.id,
        column_id=column.id,
        title="An epic",
        type=TaskType.EPIC.value,
        position=0,
    )
    session.add(epic)
    session.commit()
    session.refresh(epic)
    return user, epic


def test_update_epic_with_dates_persists_and_logs(session: Session) -> None:
    """Updating start_date/due_date must not crash on activity-log JSON serialization."""
    user, epic = _setup(session)
    service = EpicsService()

    start = datetime(2026, 6, 24, tzinfo=timezone.utc)
    due = datetime(2026, 7, 29, tzinfo=timezone.utc)
    updated = service.update_epic(
        session, epic.id, EpicUpdate(startDate=start, dueDate=due), user
    )

    # SQLite has no tz-aware datetime, so compare on the calendar values.
    assert updated.start_date is not None
    assert updated.start_date.replace(tzinfo=None) == start.replace(tzinfo=None)
    assert updated.due_date is not None
    assert updated.due_date.replace(tzinfo=None) == due.replace(tzinfo=None)

    # The activity log row was committed — proving new_value serialized without
    # raising TypeError on the datetime fields (the regression under test).
    from app.models.activity_logs_model import ActivityLog

    logs = session.exec(
        select(ActivityLog).where(ActivityLog.task_id == epic.id)
    ).all()
    assert len(logs) == 1
    assert isinstance(logs[0].new_value["start_date"], str)
    assert isinstance(logs[0].new_value["due_date"], str)
