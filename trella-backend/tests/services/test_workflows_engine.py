import uuid
import pytest
from fastapi import HTTPException
from sqlmodel import Session, create_engine, select
from sqlalchemy.pool import StaticPool

from app.models import SQLModel
from app.models.board_columns_model import BoardColumn
from app.models.boards_model import Board
from app.models.custom_statuses_model import CustomStatus
from app.models.projects_model import Project
from app.models.tasks_model import Task
from app.models.users_model import User
from app.models.workspaces_model import Workspace
from app.models.project_members_model import ProjectMember
from app.models.enums import WorkspaceMode, MemberStatus, ProjectRole
from app.services.tasks_service import TasksService
from app.services.workflows_service import WorkflowsService
from app.schemas.tasks_schema import TaskUpdate

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
    "sprints",
    "workflows",
    "workflow_transitions",
]


@pytest.fixture
def session():
    """Yield a database session with only the required tables."""
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


class _DummyActivityLogs:
    def record(self, *args, **kwargs):
        pass


class _DummyNotifications:
    def emit(self, *args, **kwargs):
        pass


def _setup_workspace_scrum(session: Session) -> tuple[Workspace, Project, User, Task]:
    workspace = Workspace(name="Acme Jira", mode=WorkspaceMode.SCRUM.value)
    session.add(workspace)
    session.commit()
    session.refresh(workspace)

    user = User(
        email="pm@example.com", full_name="Project Manager", hashed_password="pw"
    )
    session.add(user)
    session.commit()
    session.refresh(user)

    project = Project(
        workspace_id=workspace.id, name="Eng Project", key="ENG", created_by=user.id
    )
    session.add(project)
    session.commit()
    session.refresh(project)

    # Add project member
    pm = ProjectMember(
        project_id=project.id,
        user_id=user.id,
        project_role=ProjectRole.PROJECT_ADMIN.value,
        status=MemberStatus.ACTIVE.value,
    )
    session.add(pm)
    session.commit()

    board = Board(project_id=project.id, title="Sprint 1 Board")
    session.add(board)
    session.commit()
    session.refresh(board)

    # Columns
    col_todo = BoardColumn(
        board_id=board.id, name="Backlog", status_key="todo", position=0
    )
    col_done = BoardColumn(
        board_id=board.id, name="Done", status_key="done", position=1
    )
    session.add(col_todo)
    session.add(col_done)
    session.commit()
    session.refresh(col_todo)

    task = Task(
        project_id=project.id,
        board_id=board.id,
        column_id=col_todo.id,
        title="Jira Issue 1",
        position=0,
    )
    session.add(task)
    session.commit()
    session.refresh(task)

    return workspace, project, user, task


def test_kanban_mode_bypasses_workflow_validation(session: Session):
    # Setup Kanban workspace
    workspace = Workspace(name="Acme Trello", mode=WorkspaceMode.KANBAN.value)
    session.add(workspace)
    session.commit()

    user = User(
        email="trello@example.com", full_name="Trello User", hashed_password="pw"
    )
    session.add(user)
    session.commit()

    project = Project(
        workspace_id=workspace.id, name="Trello Project", key="TR", created_by=user.id
    )
    session.add(project)
    session.commit()

    pm = ProjectMember(
        project_id=project.id,
        user_id=user.id,
        project_role=ProjectRole.PROJECT_MEMBER.value,
        status=MemberStatus.ACTIVE.value,
    )
    session.add(pm)
    session.commit()

    board = Board(project_id=project.id, title="Trello Board")
    session.add(board)
    session.commit()

    col_a = BoardColumn(board_id=board.id, name="Col A", status_key="todo", position=0)
    col_b = BoardColumn(board_id=board.id, name="Col B", status_key="done", position=1)
    session.add(col_a)
    session.add(col_b)
    session.commit()

    cs_b = CustomStatus(
        workspace_id=workspace.id, name="Col B", canonical_status="DONE"
    )
    session.add(cs_b)
    session.commit()

    task = Task(
        project_id=project.id,
        board_id=board.id,
        column_id=col_a.id,
        title="Trello Card",
        position=0,
    )
    session.add(task)
    session.commit()

    service = TasksService(
        activity_logs_service=_DummyActivityLogs(),
        notification_service=_DummyNotifications(),
    )

    # KANBAN mode allows moving from Col A -> Col B freely without workflow constraints
    updated = service.update_task(
        session, task.id, TaskUpdate(custom_status_id=cs_b.id), user
    )
    assert updated.custom_status_id == cs_b.id


def test_scrum_mode_enforces_workflow_transitions(session: Session):
    workspace, project, user, task = _setup_workspace_scrum(session)

    # Bootstrap default workflow templates
    wf_service = WorkflowsService()
    workflow = wf_service.bootstrap_default_workflow(session, workspace.id)

    # Map project to workflow
    project.workflow_id = workflow.id
    session.add(project)
    session.commit()

    # Find the statuses
    cs_backlog = session.exec(
        select(CustomStatus).where(
            CustomStatus.workspace_id == workspace.id, CustomStatus.name == "Backlog"
        )
    ).first()
    cs_selected = session.exec(
        select(CustomStatus).where(
            CustomStatus.workspace_id == workspace.id,
            CustomStatus.name == "Selected for Development",
        )
    ).first()
    cs_done = session.exec(
        select(CustomStatus).where(
            CustomStatus.workspace_id == workspace.id, CustomStatus.name == "Done"
        )
    ).first()

    service = TasksService(
        activity_logs_service=_DummyActivityLogs(),
        notification_service=_DummyNotifications(),
    )

    # 1. Test invalid transition: Backlog -> Done raises error because Done requires comment (and transition path checks global rules)
    # The default template defines "Done" as requiring a comment validator. Let's verify it raises HTTPException 400.
    with pytest.raises(HTTPException) as exc:
        service.update_task(
            session, task.id, TaskUpdate(custom_status_id=cs_done.id), user
        )
    assert exc.value.status_code == 400
    assert "transition comment is required" in exc.value.detail

    # 2. Test valid transition with required validator
    updated = service.update_task(
        session,
        task.id,
        TaskUpdate(custom_status_id=cs_done.id, transition_comment="Finished task!"),
        user,
    )
    assert updated.custom_status_id == cs_done.id

    # Reset task status to backlog
    task.custom_status_id = cs_backlog.id
    session.add(task)
    session.commit()

    # 3. Test post-transition action: Start Progress auto-assigns task to actor
    task.assignee_id = None
    session.add(task)
    session.commit()

    # Move Backlog -> Selected for Development (valid transition, no assignee change)
    task = service.update_task(
        session, task.id, TaskUpdate(custom_status_id=cs_selected.id), user
    )
    assert task.custom_status_id == cs_selected.id
    assert task.assignee_id is None

    # Move Selected for Development -> In Progress (triggers AUTO_ASSIGN_TO_ACTOR action)
    cs_inprogress = session.exec(
        select(CustomStatus).where(
            CustomStatus.workspace_id == workspace.id,
            CustomStatus.name == "In Progress",
        )
    ).first()
    task = service.update_task(
        session, task.id, TaskUpdate(custom_status_id=cs_inprogress.id), user
    )
    assert task.assignee_id == user.id

    # 4. Test transition condition: Submit for Review (In Progress -> Code Review) is ASSIGNEE_ONLY.
    # If a different user tries to transition it, it should fail.
    outsider = User(
        email="outsider@example.com", full_name="Outsider", hashed_password="pw"
    )
    session.add(outsider)
    session.commit()

    # Add outsider as project member so they pass project authorization check
    session.add(
        ProjectMember(
            project_id=project.id,
            user_id=outsider.id,
            project_role=ProjectRole.PROJECT_MEMBER.value,
            status=MemberStatus.ACTIVE.value,
        )
    )
    session.commit()

    cs_codereview = session.exec(
        select(CustomStatus).where(
            CustomStatus.workspace_id == workspace.id,
            CustomStatus.name == "Code Review",
        )
    ).first()

    with pytest.raises(HTTPException) as exc:
        service.update_task(
            session, task.id, TaskUpdate(custom_status_id=cs_codereview.id), outsider
        )
    assert exc.value.status_code == 403
    assert "Only the current assignee can transition" in exc.value.detail

    # Transition by assignee should succeed
    task = service.update_task(
        session, task.id, TaskUpdate(custom_status_id=cs_codereview.id), user
    )
    assert task.custom_status_id == cs_codereview.id
