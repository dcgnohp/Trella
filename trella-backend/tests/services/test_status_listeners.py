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
