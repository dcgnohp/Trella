"""Unit tests for ``BoardsService`` (task 13.2).

Cover the create / update / get flows against a real in-memory SQLite session:

- create: success path (board persisted, ``OrgLimit.count`` incremented, audit
  CREATE row written), non-member -> 403, free-tier cap reached -> 403;
- update: partial update applied + audit UPDATE, missing board -> 404,
  non-member -> 403;
- get: success, missing board -> 404, non-member -> 403.

No mocks: ``BoardsService`` is wired with its real collaborators
(``OrganizationMemberService``, ``OrgLimitService``, ``AuditLogsService``).
"""

import uuid

import pytest
from fastapi import HTTPException
from sqlmodel import Session, select

from app.core.config import settings
from app.models.audit_logs_model import AuditLog
from app.models.board_lists_model import List
from app.models.boards_model import Board
from app.models.org_limits_model import OrgLimit
from app.models.organization_members_model import OrganizationMember
from app.models.organizations_model import Organization
from app.models.task_cards_model import Card
from app.models.users_model import User
from app.schemas.boards_schema import BoardCreate, BoardUpdate
from app.services.boards_service import BoardsService


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


def _seed_org(session: Session, count: int = 0) -> Organization:
    org = Organization(name="Acme")
    session.add(org)
    session.commit()
    session.refresh(org)
    session.add(OrgLimit(org_id=org.id, count=count))
    session.commit()
    return org


def _add_member(session: Session, org_id: uuid.UUID, user_id: uuid.UUID) -> None:
    session.add(
        OrganizationMember(org_id=org_id, user_id=user_id, role="OWNER")
    )
    session.commit()


def _count(session: Session, org_id: uuid.UUID) -> int:
    limit = session.exec(
        select(OrgLimit).where(OrgLimit.org_id == org_id)
    ).one()
    return limit.count


def test_create_board_success(session: Session) -> None:
    user = _seed_user(session)
    org = _seed_org(session, count=0)
    _add_member(session, org.id, user.id)

    service = BoardsService()
    data = BoardCreate(org_id=org.id, title="Sprint 1")
    board = service.create_board(session, data, user)

    assert board.id is not None
    assert board.org_id == org.id
    assert board.title == "Sprint 1"
    # OrgLimit incremented (Req 5.6, 9.4)
    assert _count(session, org.id) == 1
    # Audit CREATE row written in same transaction (Req 8.1)
    logs = session.exec(select(AuditLog).where(AuditLog.org_id == org.id)).all()
    assert len(logs) == 1
    assert logs[0].action == "CREATE"
    assert logs[0].entity_type == "BOARD"
    assert logs[0].entity_id == board.id
    assert logs[0].entity_title == "Sprint 1"
    assert logs[0].user_id == user.id


def test_create_board_non_member_forbidden(session: Session) -> None:
    user = _seed_user(session)
    org = _seed_org(session, count=0)  # user is NOT added as member

    service = BoardsService()
    data = BoardCreate(org_id=org.id, title="Sprint 1")
    with pytest.raises(HTTPException) as exc:
        service.create_board(session, data, user)
    assert exc.value.status_code == 403
    assert exc.value.detail == "Not a member of this organization"
    # nothing persisted
    assert session.exec(select(Board)).first() is None
    assert _count(session, org.id) == 0


def test_create_board_limit_reached_forbidden(session: Session) -> None:
    user = _seed_user(session)
    org = _seed_org(session, count=settings.MAX_FREE_BOARDS)
    _add_member(session, org.id, user.id)

    service = BoardsService()
    data = BoardCreate(org_id=org.id, title="Over the limit")
    with pytest.raises(HTTPException) as exc:
        service.create_board(session, data, user)
    assert exc.value.status_code == 403
    assert exc.value.detail == "Free tier board limit reached"
    # nothing created, count unchanged
    assert session.exec(select(Board)).first() is None
    assert _count(session, org.id) == settings.MAX_FREE_BOARDS


def test_update_board_applies_partial_update_and_audits(session: Session) -> None:
    user = _seed_user(session)
    org = _seed_org(session, count=0)
    _add_member(session, org.id, user.id)
    service = BoardsService()
    board = service.create_board(
        session, BoardCreate(org_id=org.id, title="Old"), user
    )

    updated = service.update_board(
        session, board.id, BoardUpdate(title="New title"), user
    )
    assert updated.title == "New title"
    # an UPDATE audit row now exists alongside the CREATE one
    actions = {
        log.action
        for log in session.exec(
            select(AuditLog).where(AuditLog.entity_id == board.id)
        ).all()
    }
    assert actions == {"CREATE", "UPDATE"}


def test_update_board_missing_not_found(session: Session) -> None:
    user = _seed_user(session)
    service = BoardsService()
    with pytest.raises(HTTPException) as exc:
        service.update_board(
            session, uuid.uuid4(), BoardUpdate(title="x"), user
        )
    assert exc.value.status_code == 404


def test_update_board_non_member_forbidden(session: Session) -> None:
    owner = _seed_user(session)
    outsider = _seed_user(session)
    org = _seed_org(session, count=0)
    _add_member(session, org.id, owner.id)
    service = BoardsService()
    board = service.create_board(
        session, BoardCreate(org_id=org.id, title="Owned"), owner
    )

    with pytest.raises(HTTPException) as exc:
        service.update_board(
            session, board.id, BoardUpdate(title="hijack"), outsider
        )
    assert exc.value.status_code == 403


def test_get_board_success(session: Session) -> None:
    user = _seed_user(session)
    org = _seed_org(session, count=0)
    _add_member(session, org.id, user.id)
    service = BoardsService()
    created = service.create_board(
        session, BoardCreate(org_id=org.id, title="Visible"), user
    )

    fetched = service.get_board(session, created.id, user)
    assert fetched.id == created.id


def test_get_board_missing_not_found(session: Session) -> None:
    user = _seed_user(session)
    service = BoardsService()
    with pytest.raises(HTTPException) as exc:
        service.get_board(session, uuid.uuid4(), user)
    assert exc.value.status_code == 404


def test_get_board_non_member_forbidden(session: Session) -> None:
    owner = _seed_user(session)
    outsider = _seed_user(session)
    org = _seed_org(session, count=0)
    _add_member(session, org.id, owner.id)
    service = BoardsService()
    board = service.create_board(
        session, BoardCreate(org_id=org.id, title="Owned"), owner
    )

    with pytest.raises(HTTPException) as exc:
        service.get_board(session, board.id, outsider)
    assert exc.value.status_code == 403


# --- list_boards (task 13.4, Req 4) --------------------------------------


def test_list_boards_returns_org_boards(session: Session) -> None:
    user = _seed_user(session)
    org = _seed_org(session, count=0)
    _add_member(session, org.id, user.id)
    service = BoardsService()
    b1 = service.create_board(
        session, BoardCreate(org_id=org.id, title="One"), user
    )
    b2 = service.create_board(
        session, BoardCreate(org_id=org.id, title="Two"), user
    )

    boards = service.list_boards(session, org.id, user)
    assert {b.id for b in boards} == {b1.id, b2.id}


def test_list_boards_is_org_scoped(session: Session) -> None:
    user = _seed_user(session)
    org_a = _seed_org(session, count=0)
    org_b = _seed_org(session, count=0)
    _add_member(session, org_a.id, user.id)
    _add_member(session, org_b.id, user.id)
    service = BoardsService()
    service.create_board(
        session, BoardCreate(org_id=org_a.id, title="A board"), user
    )
    b_in_b = service.create_board(
        session, BoardCreate(org_id=org_b.id, title="B board"), user
    )

    boards = service.list_boards(session, org_b.id, user)
    assert [b.id for b in boards] == [b_in_b.id]


def test_list_boards_non_member_forbidden(session: Session) -> None:
    owner = _seed_user(session)
    outsider = _seed_user(session)
    org = _seed_org(session, count=0)
    _add_member(session, org.id, owner.id)
    service = BoardsService()
    service.create_board(
        session, BoardCreate(org_id=org.id, title="Owned"), owner
    )

    with pytest.raises(HTTPException) as exc:
        service.list_boards(session, org.id, outsider)
    assert exc.value.status_code == 403


# --- get_board_detail (task 13.3, Req 5.2) -------------------------------


def _seed_list(
    session: Session, board_id: uuid.UUID, title: str, order: int
) -> List:
    board_list = List(board_id=board_id, title=title, order=order)
    session.add(board_list)
    session.commit()
    session.refresh(board_list)
    return board_list


def _seed_card(
    session: Session, list_id: uuid.UUID, title: str, order: int
) -> Card:
    card = Card(list_id=list_id, title=title, order=order)
    session.add(card)
    session.commit()
    session.refresh(card)
    return card


def test_get_board_detail_nests_lists_and_cards_in_ascending_order(
    session: Session,
) -> None:
    user = _seed_user(session)
    org = _seed_org(session, count=0)
    _add_member(session, org.id, user.id)
    service = BoardsService()
    board = service.create_board(
        session, BoardCreate(org_id=org.id, title="Board"), user
    )
    # Insert lists out of order; service must return them ascending by ``order``.
    _seed_list(session, board.id, "second", order=1)
    list_a = _seed_list(session, board.id, "first", order=0)
    # Insert cards under list_a out of order too.
    _seed_card(session, list_a.id, "card-1", order=1)
    _seed_card(session, list_a.id, "card-0", order=0)

    detail = service.get_board_detail(session, board.id, user)

    assert detail.id == board.id
    assert [lst.title for lst in detail.lists] == ["first", "second"]
    assert [lst.order for lst in detail.lists] == [0, 1]
    # cards on the first list come back ascending by order
    first_list = detail.lists[0]
    assert [c.title for c in first_list.cards] == ["card-0", "card-1"]
    assert [c.order for c in first_list.cards] == [0, 1]
    # the second list has no cards
    assert detail.lists[1].cards == []


def test_get_board_detail_empty_board_has_no_lists(session: Session) -> None:
    user = _seed_user(session)
    org = _seed_org(session, count=0)
    _add_member(session, org.id, user.id)
    service = BoardsService()
    board = service.create_board(
        session, BoardCreate(org_id=org.id, title="Empty"), user
    )

    detail = service.get_board_detail(session, board.id, user)
    assert detail.lists == []


def test_get_board_detail_missing_not_found(session: Session) -> None:
    user = _seed_user(session)
    service = BoardsService()
    with pytest.raises(HTTPException) as exc:
        service.get_board_detail(session, uuid.uuid4(), user)
    assert exc.value.status_code == 404


def test_get_board_detail_non_member_forbidden(session: Session) -> None:
    owner = _seed_user(session)
    outsider = _seed_user(session)
    org = _seed_org(session, count=0)
    _add_member(session, org.id, owner.id)
    service = BoardsService()
    board = service.create_board(
        session, BoardCreate(org_id=org.id, title="Owned"), owner
    )

    with pytest.raises(HTTPException) as exc:
        service.get_board_detail(session, board.id, outsider)
    assert exc.value.status_code == 403


# --- delete_board (task 13.3, Req 5.4, 9.5, 8.1) --------------------------


def test_delete_board_removes_board_decrements_count_and_audits(
    session: Session,
) -> None:
    user = _seed_user(session)
    org = _seed_org(session, count=0)
    _add_member(session, org.id, user.id)
    service = BoardsService()
    board = service.create_board(
        session, BoardCreate(org_id=org.id, title="Doomed"), user
    )
    assert _count(session, org.id) == 1  # incremented on create

    service.delete_board(session, board.id, user)

    # board row is gone (Req 5.4)
    assert session.get(Board, board.id) is None
    # OrgLimit count decremented back to 0 (Req 9.5)
    assert _count(session, org.id) == 0
    # a DELETE audit row was written in the same transaction (Req 8.1)
    actions = [
        log.action
        for log in session.exec(
            select(AuditLog).where(AuditLog.entity_id == board.id)
        ).all()
    ]
    assert "DELETE" in actions
    delete_log = session.exec(
        select(AuditLog).where(
            AuditLog.entity_id == board.id, AuditLog.action == "DELETE"
        )
    ).one()
    assert delete_log.entity_type == "BOARD"
    assert delete_log.entity_title == "Doomed"
    assert delete_log.user_id == user.id
    assert delete_log.org_id == org.id


def test_delete_board_missing_not_found(session: Session) -> None:
    user = _seed_user(session)
    service = BoardsService()
    with pytest.raises(HTTPException) as exc:
        service.delete_board(session, uuid.uuid4(), user)
    assert exc.value.status_code == 404


def test_delete_board_non_member_forbidden(session: Session) -> None:
    owner = _seed_user(session)
    outsider = _seed_user(session)
    org = _seed_org(session, count=0)
    _add_member(session, org.id, owner.id)
    service = BoardsService()
    board = service.create_board(
        session, BoardCreate(org_id=org.id, title="Owned"), owner
    )

    with pytest.raises(HTTPException) as exc:
        service.delete_board(session, board.id, outsider)
    assert exc.value.status_code == 403
    # nothing deleted, count unchanged
    assert session.get(Board, board.id) is not None
    assert _count(session, org.id) == 1
