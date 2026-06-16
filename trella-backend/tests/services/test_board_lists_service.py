"""Unit tests for ``BoardListsService`` (tasks 14.2 and 14.3).

Cover the create / update / delete flows against a real in-memory SQLite
session:

- create: appends ``order`` (0 then 1) and writes a CREATE audit row; missing
  board -> 404; non-member -> 403;
- update: partial update applied + UPDATE audit row;
- delete: list removed + DELETE audit row;
- ordering: ``list_by_board`` returns lists sorted by ``order`` ascending.

Org-scoping for a List is resolved through its board (``board_id -> board.org_id``)
per Req 4.4. No mocks: ``BoardListsService`` is wired with its real collaborators
(``BoardListsRepository``, ``BoardsRepository``, ``OrganizationMemberService``,
``AuditLogsService``).
"""

import uuid

import pytest
from fastapi import HTTPException
from sqlmodel import Session, select

from app.models.audit_logs_model import AuditLog
from app.models.board_lists_model import List
from app.models.boards_model import Board
from app.models.organization_members_model import OrganizationMember
from app.models.organizations_model import Organization
from app.models.task_cards_model import Card
from app.models.users_model import User
from app.repositories.board_lists_repository import BoardListsRepository
from app.repositories.task_cards_repository import TaskCardsRepository
from app.schemas.board_lists_schema import ListCreate, ListReorderItem, ListUpdate
from app.services.board_lists_service import BoardListsService


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


def _seed_org(session: Session) -> Organization:
    org = Organization(name="Acme")
    session.add(org)
    session.commit()
    session.refresh(org)
    return org


def _add_member(session: Session, org_id: uuid.UUID, user_id: uuid.UUID) -> None:
    session.add(OrganizationMember(org_id=org_id, user_id=user_id, role="OWNER"))
    session.commit()


def _seed_board(session: Session, org_id: uuid.UUID) -> Board:
    board = Board(org_id=org_id, title="Sprint 1")
    session.add(board)
    session.commit()
    session.refresh(board)
    return board


def _setup(session: Session) -> tuple[User, Board]:
    """Seed a user, org, membership and board; return ``(user, board)``."""
    user = _seed_user(session)
    org = _seed_org(session)
    _add_member(session, org.id, user.id)
    board = _seed_board(session, org.id)
    return user, board


def test_create_list_appends_order(session: Session) -> None:
    user, board = _setup(session)
    service = BoardListsService()

    first = service.create_list(
        session, ListCreate(title="To Do", board_id=board.id), user
    )
    second = service.create_list(
        session, ListCreate(title="Doing", board_id=board.id), user
    )

    # First list of a board gets order 0, the next gets 1 (Req 6.1).
    assert first.order == 0
    assert second.order == 1
    assert first.board_id == board.id

    # A CREATE audit row was written for each list (Req 8.1).
    logs = session.exec(select(AuditLog).where(AuditLog.entity_id == first.id)).all()
    assert len(logs) == 1
    assert logs[0].action == "CREATE"
    assert logs[0].entity_type == "LIST"
    assert logs[0].entity_title == "To Do"
    assert logs[0].user_id == user.id


def test_create_list_missing_board_not_found(session: Session) -> None:
    user = _seed_user(session)
    service = BoardListsService()
    with pytest.raises(HTTPException) as exc:
        service.create_list(session, ListCreate(title="x", board_id=uuid.uuid4()), user)
    assert exc.value.status_code == 404
    assert exc.value.detail == "Board not found"
    assert session.exec(select(List)).first() is None


def test_create_list_non_member_forbidden(session: Session) -> None:
    outsider = _seed_user(session)
    org = _seed_org(session)  # outsider is NOT a member
    board = _seed_board(session, org.id)

    service = BoardListsService()
    with pytest.raises(HTTPException) as exc:
        service.create_list(session, ListCreate(title="x", board_id=board.id), outsider)
    assert exc.value.status_code == 403
    assert exc.value.detail == "Not a member of this organization"
    # nothing persisted
    assert session.exec(select(List)).first() is None


def test_update_list_partial_update_and_audits(session: Session) -> None:
    user, board = _setup(session)
    service = BoardListsService()
    created = service.create_list(
        session, ListCreate(title="Old", board_id=board.id), user
    )

    updated = service.update_list(
        session, created.id, ListUpdate(title="New title"), user
    )
    assert updated.title == "New title"
    assert updated.order == created.order  # untouched field preserved

    actions = {
        log.action
        for log in session.exec(
            select(AuditLog).where(AuditLog.entity_id == created.id)
        ).all()
    }
    assert actions == {"CREATE", "UPDATE"}


def test_update_list_missing_not_found(session: Session) -> None:
    user = _seed_user(session)
    service = BoardListsService()
    with pytest.raises(HTTPException) as exc:
        service.update_list(session, uuid.uuid4(), ListUpdate(title="x"), user)
    assert exc.value.status_code == 404
    assert exc.value.detail == "List not found"


def test_update_list_non_member_forbidden(session: Session) -> None:
    owner, board = _setup(session)
    outsider = _seed_user(session)
    service = BoardListsService()
    created = service.create_list(
        session, ListCreate(title="Owned", board_id=board.id), owner
    )

    with pytest.raises(HTTPException) as exc:
        service.update_list(session, created.id, ListUpdate(title="hijack"), outsider)
    assert exc.value.status_code == 403


def test_delete_list_removes_and_audits(session: Session) -> None:
    user, board = _setup(session)
    service = BoardListsService()
    created = service.create_list(
        session, ListCreate(title="Temp", board_id=board.id), user
    )

    service.delete_list(session, created.id, user)

    # The list is gone.
    assert session.get(List, created.id) is None
    # A DELETE audit row was written (Req 8.1) capturing the title.
    delete_logs = session.exec(
        select(AuditLog).where(
            AuditLog.entity_id == created.id, AuditLog.action == "DELETE"
        )
    ).all()
    assert len(delete_logs) == 1
    assert delete_logs[0].entity_type == "LIST"
    assert delete_logs[0].entity_title == "Temp"


def test_delete_list_missing_not_found(session: Session) -> None:
    user = _seed_user(session)
    service = BoardListsService()
    with pytest.raises(HTTPException) as exc:
        service.delete_list(session, uuid.uuid4(), user)
    assert exc.value.status_code == 404
    assert exc.value.detail == "List not found"


def test_list_by_board_ordered_by_order(session: Session) -> None:
    user, board = _setup(session)
    service = BoardListsService()
    service.create_list(session, ListCreate(title="A", board_id=board.id), user)
    service.create_list(session, ListCreate(title="B", board_id=board.id), user)
    service.create_list(session, ListCreate(title="C", board_id=board.id), user)

    rows = BoardListsRepository().list_by_board(session, board.id)
    orders = [row.order for row in rows]
    assert orders == sorted(orders)
    assert orders == [0, 1, 2]
    assert [row.title for row in rows] == ["A", "B", "C"]


def test_reorder_lists_updates_orders_and_audits(session: Session) -> None:
    user, board = _setup(session)
    service = BoardListsService()
    a = service.create_list(session, ListCreate(title="A", board_id=board.id), user)
    b = service.create_list(session, ListCreate(title="B", board_id=board.id), user)
    c = service.create_list(session, ListCreate(title="C", board_id=board.id), user)
    # Initial orders: A=0, B=1, C=2.

    # Reverse the order: A=2, B=1, C=0.
    updated = service.reorder_lists(
        session,
        board.id,
        [
            ListReorderItem(id=a.id, order=2),
            ListReorderItem(id=b.id, order=1),
            ListReorderItem(id=c.id, order=0),
        ],
        user,
    )

    new_orders = {row.id: row.order for row in updated}
    assert new_orders == {a.id: 2, b.id: 1, c.id: 0}

    # The new order is a valid permutation reflected in the DB (Req 11.3).
    rows = BoardListsRepository().list_by_board(session, board.id)
    assert [row.title for row in rows] == ["C", "B", "A"]

    # Exactly one UPDATE audit row per reordered list (Req 11.4).
    update_logs = session.exec(
        select(AuditLog).where(AuditLog.action == "UPDATE")
    ).all()
    reordered_ids = {a.id, b.id, c.id}
    update_ids = [log.entity_id for log in update_logs]
    assert sorted(update_ids) == sorted(reordered_ids)
    assert all(log.entity_type == "LIST" for log in update_logs)
    assert all(log.user_id == user.id for log in update_logs)


def test_reorder_lists_invalid_payload_leaves_db_unchanged(
    session: Session,
) -> None:
    user, board = _setup(session)
    # A second board (same org) whose list does NOT belong to ``board``.
    other_board = _seed_board(session, board.org_id)
    service = BoardListsService()
    a = service.create_list(session, ListCreate(title="A", board_id=board.id), user)
    b = service.create_list(session, ListCreate(title="B", board_id=board.id), user)
    foreign = service.create_list(
        session, ListCreate(title="Foreign", board_id=other_board.id), user
    )

    before = {
        row.id: row.order
        for row in BoardListsRepository().get_lists_by_ids(
            session, [a.id, b.id, foreign.id]
        )
    }

    # ``foreign`` belongs to ``other_board`` -> payload invalid for ``board``.
    with pytest.raises(HTTPException) as exc:
        service.reorder_lists(
            session,
            board.id,
            [
                ListReorderItem(id=a.id, order=1),
                ListReorderItem(id=b.id, order=0),
                ListReorderItem(id=foreign.id, order=2),
            ],
            user,
        )
    assert exc.value.status_code == 400
    assert exc.value.detail == "Invalid reorder payload"

    # DB is unchanged: every order preserved (Req 6.5, 11.2).
    session.expire_all()
    after = {
        row.id: row.order
        for row in BoardListsRepository().get_lists_by_ids(
            session, [a.id, b.id, foreign.id]
        )
    }
    assert after == before

    # No UPDATE audit rows were written for the aborted reorder.
    update_logs = session.exec(
        select(AuditLog).where(AuditLog.action == "UPDATE")
    ).all()
    assert update_logs == []


def test_reorder_lists_unknown_id_leaves_db_unchanged(session: Session) -> None:
    user, board = _setup(session)
    service = BoardListsService()
    a = service.create_list(session, ListCreate(title="A", board_id=board.id), user)

    with pytest.raises(HTTPException) as exc:
        service.reorder_lists(
            session,
            board.id,
            [
                ListReorderItem(id=a.id, order=1),
                ListReorderItem(id=uuid.uuid4(), order=0),
            ],
            user,
        )
    assert exc.value.status_code == 400
    assert exc.value.detail == "Invalid reorder payload"

    session.expire_all()
    assert session.get(List, a.id).order == 0


def test_reorder_lists_missing_board_not_found(session: Session) -> None:
    user = _seed_user(session)
    service = BoardListsService()
    with pytest.raises(HTTPException) as exc:
        service.reorder_lists(session, uuid.uuid4(), [], user)
    assert exc.value.status_code == 404
    assert exc.value.detail == "Board not found"


def test_reorder_lists_non_member_forbidden(session: Session) -> None:
    owner, board = _setup(session)
    outsider = _seed_user(session)
    service = BoardListsService()
    created = service.create_list(
        session, ListCreate(title="A", board_id=board.id), owner
    )

    with pytest.raises(HTTPException) as exc:
        service.reorder_lists(
            session,
            board.id,
            [ListReorderItem(id=created.id, order=0)],
            outsider,
        )
    assert exc.value.status_code == 403


def _add_card(
    session: Session, list_id: uuid.UUID, title: str, order: int
) -> Card:
    card = Card(list_id=list_id, title=title, description=f"{title}-desc", order=order)
    session.add(card)
    session.commit()
    session.refresh(card)
    return card


def test_copy_list_appends_and_copies_cards_in_order(session: Session) -> None:
    user, board = _setup(session)
    service = BoardListsService()
    # Seed an existing list so the copy is appended at max+1, plus the source.
    service.create_list(session, ListCreate(title="Existing", board_id=board.id), user)
    source = service.create_list(
        session, ListCreate(title="Source", board_id=board.id), user
    )
    # Cards added out of insertion order; copy must preserve relative order.
    _add_card(session, source.id, "C1", 1)
    _add_card(session, source.id, "C0", 0)
    _add_card(session, source.id, "C2", 2)

    copy = service.copy_list(session, source.id, user)

    # New list: "{title} - Copy", same board, appended at max+1 (Existing=0,
    # Source=1 -> copy=2) (Req 6.6).
    assert copy.title == "Source - Copy"
    assert copy.board_id == board.id
    assert copy.order == 2
    assert copy.id != source.id

    # Every source card is copied into the new list preserving relative order.
    copied = TaskCardsRepository().list_by_list(session, copy.id)
    assert [c.title for c in copied] == ["C0", "C1", "C2"]
    assert [c.order for c in copied] == [0, 1, 2]
    assert [c.description for c in copied] == ["C0-desc", "C1-desc", "C2-desc"]
    # Copies are distinct rows pointing at the new list.
    assert all(c.list_id == copy.id for c in copied)

    # Source list and its cards are left intact.
    original = TaskCardsRepository().list_by_list(session, source.id)
    assert [c.title for c in original] == ["C0", "C1", "C2"]

    # A CREATE audit row was written for the NEW list (design.md section 6).
    logs = session.exec(select(AuditLog).where(AuditLog.entity_id == copy.id)).all()
    assert len(logs) == 1
    assert logs[0].action == "CREATE"
    assert logs[0].entity_type == "LIST"
    assert logs[0].entity_title == "Source - Copy"
    assert logs[0].user_id == user.id


def test_copy_list_with_no_cards(session: Session) -> None:
    user, board = _setup(session)
    service = BoardListsService()
    source = service.create_list(
        session, ListCreate(title="Empty", board_id=board.id), user
    )

    copy = service.copy_list(session, source.id, user)

    assert copy.title == "Empty - Copy"
    assert copy.order == 1  # source=0 -> copy appended at 1
    assert TaskCardsRepository().list_by_list(session, copy.id) == []


def test_copy_list_missing_not_found(session: Session) -> None:
    user = _seed_user(session)
    service = BoardListsService()
    with pytest.raises(HTTPException) as exc:
        service.copy_list(session, uuid.uuid4(), user)
    assert exc.value.status_code == 404
    assert exc.value.detail == "List not found"


def test_copy_list_non_member_forbidden(session: Session) -> None:
    owner, board = _setup(session)
    outsider = _seed_user(session)
    service = BoardListsService()
    source = service.create_list(
        session, ListCreate(title="Owned", board_id=board.id), owner
    )

    with pytest.raises(HTTPException) as exc:
        service.copy_list(session, source.id, outsider)
    assert exc.value.status_code == 403
    assert exc.value.detail == "Not a member of this organization"
    # No copy persisted: only the source list exists.
    assert len(session.exec(select(List)).all()) == 1
