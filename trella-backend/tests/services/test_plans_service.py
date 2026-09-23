"""Unit tests for ``PlansService``.

Cover create / list / get / update / delete against a real in-memory SQLite
session (no mocks), plus ``list_epics_for_plan`` scoping through linked
boards.
"""

import uuid

import pytest
from fastapi import HTTPException
from sqlmodel import Session

from app.models.board_columns_model import BoardColumn
from app.models.boards_model import Board
from app.models.enums import TaskType
from app.models.organization_members_model import OrganizationMember
from app.models.organizations_model import Organization
from app.models.projects_model import Project
from app.models.tasks_model import Task
from app.models.users_model import User
from app.schemas.plans_schema import PlanCreate, PlanUpdate
from app.services.plans_service import PlansService


def _seed_user(session: Session) -> User:
    user = User(
        email=f"{uuid.uuid4().hex}@example.com",
        full_name="Test User",
        hashed_password="x",
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def _seed_workspace(session: Session) -> Organization:
    org = Organization(name="Acme")
    session.add(org)
    session.commit()
    session.refresh(org)
    return org


def _add_member(session: Session, workspace_id: uuid.UUID, user_id: uuid.UUID) -> None:
    session.add(
        OrganizationMember(
            workspace_id=workspace_id, user_id=user_id, role="OWNER", status="ACTIVE"
        )
    )
    session.commit()


def _seed_project(
    session: Session, workspace_id: uuid.UUID, creator_id: uuid.UUID
) -> Project:
    project = Project(
        workspace_id=workspace_id,
        name="Default Project",
        key=f"P{uuid.uuid4().hex[:6].upper()}",
        created_by=creator_id,
    )
    session.add(project)
    session.commit()
    session.refresh(project)
    return project


def _seed_board(session: Session, project_id: uuid.UUID, title: str = "Board") -> Board:
    board = Board(project_id=project_id, title=title)
    session.add(board)
    session.commit()
    session.refresh(board)
    return board


def _seed_column(session: Session, board_id: uuid.UUID) -> BoardColumn:
    column = BoardColumn(board_id=board_id, name="To Do", position=0, status_key="TODO")
    session.add(column)
    session.commit()
    session.refresh(column)
    return column


def _seed_epic(
    session: Session, project_id: uuid.UUID, board_id: uuid.UUID, column_id: uuid.UUID
) -> Task:
    task = Task(
        project_id=project_id,
        board_id=board_id,
        column_id=column_id,
        title="An epic",
        type=TaskType.EPIC.value,
        position=0,
    )
    session.add(task)
    session.commit()
    session.refresh(task)
    return task


# --- create_plan -----------------------------------------------------------


def test_create_plan_success_creates_plan_boards(session: Session) -> None:
    user = _seed_user(session)
    org = _seed_workspace(session)
    _add_member(session, org.id, user.id)
    project = _seed_project(session, org.id, user.id)
    board_a = _seed_board(session, project.id, "A")
    board_b = _seed_board(session, project.id, "B")

    service = PlansService()
    data = PlanCreate(
        name="Q1 Plan", description="desc", board_ids=[board_a.id, board_b.id]
    )
    plan = service.create_plan(session, org.id, data, user)

    assert plan.id is not None
    assert plan.workspace_id == org.id
    assert plan.name == "Q1 Plan"
    assert plan.description == "desc"
    assert plan.created_by == user.id

    linked = service.plan_boards_repo.list_by_plan(session, plan.id)
    assert {pb.board_id for pb in linked} == {board_a.id, board_b.id}


def test_create_plan_non_member_forbidden(session: Session) -> None:
    user = _seed_user(session)
    org = _seed_workspace(session)  # user is NOT added as member

    service = PlansService()
    data = PlanCreate(name="Q1 Plan")
    with pytest.raises(HTTPException) as exc:
        service.create_plan(session, org.id, data, user)
    assert exc.value.status_code == 403


# --- list_plans --------------------------------------------------------------


def test_list_plans_returns_workspace_plans(session: Session) -> None:
    user = _seed_user(session)
    org = _seed_workspace(session)
    _add_member(session, org.id, user.id)

    service = PlansService()
    p1 = service.create_plan(session, org.id, PlanCreate(name="One"), user)
    p2 = service.create_plan(session, org.id, PlanCreate(name="Two"), user)

    plans = service.list_plans(session, org.id, user)
    assert {p.id for p in plans} == {p1.id, p2.id}


def test_list_plans_non_member_forbidden(session: Session) -> None:
    owner = _seed_user(session)
    outsider = _seed_user(session)
    org = _seed_workspace(session)
    _add_member(session, org.id, owner.id)

    service = PlansService()
    service.create_plan(session, org.id, PlanCreate(name="One"), owner)

    with pytest.raises(HTTPException) as exc:
        service.list_plans(session, org.id, outsider)
    assert exc.value.status_code == 403


# --- get_plan ------------------------------------------------------------


def test_get_plan_success(session: Session) -> None:
    user = _seed_user(session)
    org = _seed_workspace(session)
    _add_member(session, org.id, user.id)
    service = PlansService()
    created = service.create_plan(session, org.id, PlanCreate(name="One"), user)

    fetched = service.get_plan(session, created.id, user)
    assert fetched.id == created.id


def test_get_plan_missing_not_found(session: Session) -> None:
    user = _seed_user(session)
    service = PlansService()
    with pytest.raises(HTTPException) as exc:
        service.get_plan(session, uuid.uuid4(), user)
    assert exc.value.status_code == 404


def test_get_plan_non_member_forbidden(session: Session) -> None:
    owner = _seed_user(session)
    outsider = _seed_user(session)
    org = _seed_workspace(session)
    _add_member(session, org.id, owner.id)
    service = PlansService()
    plan = service.create_plan(session, org.id, PlanCreate(name="Owned"), owner)

    with pytest.raises(HTTPException) as exc:
        service.get_plan(session, plan.id, outsider)
    assert exc.value.status_code == 403


# --- update_plan ---------------------------------------------------------


def test_update_plan_applies_partial_update(session: Session) -> None:
    user = _seed_user(session)
    org = _seed_workspace(session)
    _add_member(session, org.id, user.id)
    service = PlansService()
    plan = service.create_plan(session, org.id, PlanCreate(name="Old"), user)

    updated = service.update_plan(session, plan.id, PlanUpdate(name="New"), user)
    assert updated.name == "New"


def test_plan_status_lifecycle_persists(session: Session) -> None:
    """Status defaults to PLANNING and round-trips through create/update/get.

    Guards the serializer bug where the detail endpoint dropped ``status`` and
    always reported PLANNING regardless of the stored value.
    """
    user = _seed_user(session)
    org = _seed_workspace(session)
    _add_member(session, org.id, user.id)
    service = PlansService()

    # Default lifecycle entry point.
    plan = service.create_plan(session, org.id, PlanCreate(name="Lifecycle"), user)
    assert plan.status == "PLANNING"

    # Explicit status on create is honored (schema advertised it).
    active = service.create_plan(
        session, org.id, PlanCreate(name="Active", status="ACTIVE"), user
    )
    assert active.status == "ACTIVE"

    # Transition persists and is readable back.
    service.update_plan(session, plan.id, PlanUpdate(status="ON HOLD"), user)
    assert service.get_plan(session, plan.id, user).status == "ON HOLD"


def test_update_plan_missing_not_found(session: Session) -> None:
    user = _seed_user(session)
    service = PlansService()
    with pytest.raises(HTTPException) as exc:
        service.update_plan(session, uuid.uuid4(), PlanUpdate(name="x"), user)
    assert exc.value.status_code == 404


# --- delete_plan ---------------------------------------------------------


def test_delete_plan_removes_plan(session: Session) -> None:
    user = _seed_user(session)
    org = _seed_workspace(session)
    _add_member(session, org.id, user.id)
    service = PlansService()
    plan = service.create_plan(session, org.id, PlanCreate(name="Doomed"), user)

    service.delete_plan(session, plan.id, user)

    assert session.get(type(plan), plan.id) is None


def test_delete_plan_missing_not_found(session: Session) -> None:
    user = _seed_user(session)
    service = PlansService()
    with pytest.raises(HTTPException) as exc:
        service.delete_plan(session, uuid.uuid4(), user)
    assert exc.value.status_code == 404


def test_delete_plan_non_member_forbidden(session: Session) -> None:
    owner = _seed_user(session)
    outsider = _seed_user(session)
    org = _seed_workspace(session)
    _add_member(session, org.id, owner.id)
    service = PlansService()
    plan = service.create_plan(session, org.id, PlanCreate(name="Owned"), owner)

    with pytest.raises(HTTPException) as exc:
        service.delete_plan(session, plan.id, outsider)
    assert exc.value.status_code == 403


# --- list_epics_for_plan --------------------------------------------------


def test_list_epics_for_plan_empty_plan_returns_empty(session: Session) -> None:
    user = _seed_user(session)
    org = _seed_workspace(session)
    _add_member(session, org.id, user.id)
    service = PlansService()
    plan = service.create_plan(session, org.id, PlanCreate(name="No boards"), user)

    epics = service.list_epics_for_plan(session, plan.id, user)
    assert epics == []


def test_list_epics_for_plan_scoped_to_linked_boards(session: Session) -> None:
    """Epics on boards NOT linked to the plan must be excluded."""
    user = _seed_user(session)
    org = _seed_workspace(session)
    _add_member(session, org.id, user.id)
    project = _seed_project(session, org.id, user.id)

    linked_board = _seed_board(session, project.id, "Linked")
    linked_column = _seed_column(session, linked_board.id)
    linked_epic = _seed_epic(session, project.id, linked_board.id, linked_column.id)

    other_board = _seed_board(session, project.id, "Other")
    other_column = _seed_column(session, other_board.id)
    _seed_epic(session, project.id, other_board.id, other_column.id)  # excluded

    service = PlansService()
    plan = service.create_plan(
        session, org.id, PlanCreate(name="Scoped", board_ids=[linked_board.id]), user
    )

    epics = service.list_epics_for_plan(session, plan.id, user)
    assert [e.id for e in epics] == [linked_epic.id]


def test_list_epics_for_plan_excludes_subtasks(session: Session) -> None:
    user = _seed_user(session)
    org = _seed_workspace(session)
    _add_member(session, org.id, user.id)
    project = _seed_project(session, org.id, user.id)

    linked_board = _seed_board(session, project.id, "Linked")
    linked_column = _seed_column(session, linked_board.id)

    subtask = Task(
        project_id=project.id,
        board_id=linked_board.id,
        column_id=linked_column.id,
        title="A subtask",
        type=TaskType.SUBTASK.value,
        position=0,
    )
    normal_task = Task(
        project_id=project.id,
        board_id=linked_board.id,
        column_id=linked_column.id,
        title="A normal task",
        type=TaskType.TASK.value,
        position=1,
    )
    session.add(subtask)
    session.add(normal_task)
    session.commit()

    service = PlansService()
    plan = service.create_plan(
        session,
        org.id,
        PlanCreate(name="Subtask filter", board_ids=[linked_board.id]),
        user,
    )

    epics = service.list_epics_for_plan(session, plan.id, user)
    assert normal_task.id in [e.id for e in epics]
    assert subtask.id not in [e.id for e in epics]


def test_list_epics_for_plan_missing_plan_not_found(session: Session) -> None:
    user = _seed_user(session)
    service = PlansService()
    with pytest.raises(HTTPException) as exc:
        service.list_epics_for_plan(session, uuid.uuid4(), user)
    assert exc.value.status_code == 404
