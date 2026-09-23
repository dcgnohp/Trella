import uuid
import pytest
from sqlmodel import Session, select
from app.models.workspaces_model import Workspace
from app.models.projects_model import Project
from app.models.boards_model import Board
from app.models.board_columns_model import BoardColumn
from app.models.custom_statuses_model import CustomStatus
from app.models.tasks_model import Task
from app.models.task_cards_model import Card
from app.models.users_model import User


def test_task_and_card_status_resolution(session: Session) -> None:
    # 1. Seed Workspace
    workspace = Workspace(name="Acme Corp")
    session.add(workspace)
    session.commit()
    session.refresh(workspace)

    # 2. Seed User
    user = User(
        email="test@example.com",
        full_name="Test User",
        hashed_password="xxx",
        status="ACTIVE",
    )
    session.add(user)
    session.commit()
    session.refresh(user)

    # 3. Seed Custom Statuses
    todo_status = CustomStatus(
        workspace_id=workspace.id,
        name="To Do",
        color="#6b7280",
        canonical_status="TODO",
    )
    pending_status = CustomStatus(
        workspace_id=workspace.id,
        name="Pending",
        color="#f59e0b",
        canonical_status="PENDING",
    )
    session.add(todo_status)
    session.add(pending_status)
    session.commit()
    session.refresh(todo_status)
    session.refresh(pending_status)

    # 4. Seed Project
    project = Project(
        workspace_id=workspace.id,
        name="Default Project",
        key="DEFAULT",
        created_by=user.id,
    )
    session.add(project)
    session.commit()
    session.refresh(project)

    # 4. Seed Board
    board = Board(
        project_id=project.id,
        title="Main Board",
    )
    session.add(board)
    session.commit()
    session.refresh(board)

    # 5. Seed Columns
    todo_col = BoardColumn(
        board_id=board.id,
        name="To Do",
        status_key="todo",
        position=0,
    )
    pending_col = BoardColumn(
        board_id=board.id,
        name="Pending",
        status_key="pending",
        position=1,
    )
    session.add(todo_col)
    session.add(pending_col)
    session.commit()
    session.refresh(todo_col)
    session.refresh(pending_col)

    # 6. Test Task before_insert auto-resolution
    task = Task(
        project_id=project.id,
        board_id=board.id,
        column_id=todo_col.id,
        title="Test Task 1",
        position=0,
    )
    session.add(task)
    session.commit()
    session.refresh(task)

    # Assert that custom_status_id was resolved to todo_status.id
    assert task.custom_status_id == todo_status.id

    # 7. Test Task before_update auto-resolution
    task.column_id = pending_col.id
    session.add(task)
    session.commit()
    session.refresh(task)

    # Assert that custom_status_id was resolved to pending_status.id
    assert task.custom_status_id == pending_status.id

    # 8. Test Card before_insert auto-resolution
    card = Card(
        list_id=todo_col.id,
        title="Test Card 1",
        order=0,
        board_id=board.id,
        project_id=project.id,
    )
    session.add(card)
    session.commit()
    session.refresh(card)

    # Assert that custom_status_id was resolved to todo_status.id
    assert card.custom_status_id == todo_status.id

    # 9. Test Card before_update auto-resolution
    card.list_id = pending_col.id
    session.add(card)
    session.commit()
    session.refresh(card)

    # Assert that custom_status_id was resolved to pending_status.id
    assert card.custom_status_id == pending_status.id


def test_automatic_status_registration_on_column_ops(session: Session) -> None:
    from app.services.board_columns_service import BoardColumnsService
    from app.schemas.board_columns_schema import ColumnCreate, ColumnUpdate
    from app.models.workspaces_model import Workspace
    from app.models.projects_model import Project
    from app.models.boards_model import Board
    from app.models.custom_statuses_model import CustomStatus
    from app.models.tasks_model import Task
    from app.models.users_model import User
    from app.models.enums import ProjectRole, MemberStatus
    from app.models.project_members_model import ProjectMember
    from app.models.workspace_members_model import WorkspaceMember

    # 1. Setup workspace/project/board/user
    workspace = Workspace(name="Test Workspace")
    session.add(workspace)
    session.commit()
    session.refresh(workspace)

    user = User(
        email="test_col@example.com",
        full_name="Col User",
        hashed_password="xxx",
        status="ACTIVE",
    )
    session.add(user)
    session.commit()
    session.refresh(user)

    # Make user workspace owner / member to pass RBAC
    session.add(
        WorkspaceMember(
            workspace_id=workspace.id,
            user_id=user.id,
            role="OWNER",
            status="ACTIVE",
        )
    )
    session.commit()

    project = Project(
        workspace_id=workspace.id,
        name="Test Project",
        key="TEST",
        created_by=user.id,
    )
    session.add(project)
    session.commit()
    session.refresh(project)

    # Project member
    session.add(
        ProjectMember(
            project_id=project.id,
            user_id=user.id,
            project_role=ProjectRole.PROJECT_ADMIN.value,
            status=MemberStatus.ACTIVE.value,
        )
    )
    session.commit()

    board = Board(
        project_id=project.id,
        title="Test Board",
    )
    session.add(board)
    session.commit()
    session.refresh(board)

    # 2. Instantiate Column Service
    col_service = BoardColumnsService()

    # 3. Create a column and check custom status registration
    create_data = ColumnCreate(name="Testing Column", status_key="todo")
    col1 = col_service.create_column(session, board.id, create_data, user)

    # Verify CustomStatus was created
    stmt = select(CustomStatus).where(
        CustomStatus.workspace_id == workspace.id,
        CustomStatus.name == "Testing Column",
    )
    cs = session.exec(stmt).first()
    assert cs is not None
    assert cs.canonical_status == "TODO"

    # 4. Add task to this column, verify custom status is resolved correctly (by name)
    task = Task(
        project_id=project.id,
        board_id=board.id,
        column_id=col1.id,
        title="Task in Testing",
        position=0,
    )
    session.add(task)
    session.commit()
    session.refresh(task)

    assert task.custom_status_id == cs.id

    # 5. Rename column, check new custom status registration and task remapping
    update_data = ColumnUpdate(name="Testing Column Renamed")
    col1_updated = col_service.update_column(
        session, board.id, col1.id, update_data, user
    )

    # Verify new custom status is created
    stmt2 = select(CustomStatus).where(
        CustomStatus.workspace_id == workspace.id,
        CustomStatus.name == "Testing Column Renamed",
    )
    cs_new = session.exec(stmt2).first()
    assert cs_new is not None

    # Verify existing task custom_status_id is remapped to new custom status id
    session.refresh(task)
    assert task.custom_status_id == cs_new.id

    # 6. Create an unmapped column and check custom status is unmapped
    create_data_unmapped = ColumnCreate(name="Unmapped Column", status_key="UNMAPPED")
    col_unmapped = col_service.create_column(
        session, board.id, create_data_unmapped, user
    )

    stmt_unmapped = select(CustomStatus).where(
        CustomStatus.workspace_id == workspace.id,
        CustomStatus.name == "Unmapped Column",
    )
    cs_unmapped = session.exec(stmt_unmapped).first()
    assert cs_unmapped is not None
    assert cs_unmapped.canonical_status is None
