"""Unit tests for ``TaskCardsService`` (task 15.2).

Cover the create / update / delete flows against a real in-memory SQLite
session:

- create: appends ``order`` (0 then 1) and writes a CREATE audit row; missing
  list -> 404; non-member -> 403;
- update: partial update (title + description) applied + UPDATE audit row;
- delete: card removed + DELETE audit row capturing the title;
- ordering: ``list_by_list`` returns cards sorted by ``order`` ascending.

Org-scoping for a Card is resolved through its list + board
(``card.list_id -> list.board_id -> board.org_id``) per Req 4.4. No mocks:
``TaskCardsService`` is wired with its real collaborators
(``TaskCardsRepository``, ``BoardListsRepository``, ``BoardsRepository``,
``OrganizationMemberService``, ``AuditLogsService``).
"""

import uuid

import pytest
from fastapi import HTTPException
from sqlmodel import Session, col, select

from app.models.audit_logs_model import AuditLog
from app.models.board_lists_model import List
from app.models.boards_model import Board
from app.models.organization_members_model import OrganizationMember
from app.models.organizations_model import Organization
from app.models.task_cards_model import Card
from app.models.users_model import User
from app.repositories.task_cards_repository import TaskCardsRepository
from app.schemas.task_cards_schema import CardCreate, CardReorderItem, CardUpdate
from app.services.task_cards_service import TaskCardsService


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
    session.add(
        OrganizationMember(org_id=org_id, user_id=user_id, role="OWNER")
    )
    session.commit()


def _seed_board(session: Session, org_id: uuid.UUID) -> Board:
    board = Board(org_id=org_id, title="Sprint 1")
    session.add(board)
    session.commit()
    session.refresh(board)
    return board


def _seed_list(session: Session, board_id: uuid.UUID) -> List:
    board_list = List(board_id=board_id, title="To Do", order=0)
    session.add(board_list)
    session.commit()
    session.refresh(board_list)
    return board_list


def _setup(session: Session) -> tuple[User, List]:
    """Seed a user, org, membership, board and list; return ``(user, list)``."""
    user = _seed_user(session)
    org = _seed_org(session)
    _add_member(session, org.id, user.id)
    board = _seed_board(session, org.id)
    board_list = _seed_list(session, board.id)
    return user, board_list


def test_create_card_appends_order(session: Session) -> None:
    user, board_list = _setup(session)
    service = TaskCardsService()

    first = service.create_card(
        session, CardCreate(title="Card A", list_id=board_list.id), user
    )
    second = service.create_card(
        session, CardCreate(title="Card B", list_id=board_list.id), user
    )

    # First card of a list gets order 0, the next gets 1 (Req 7.1).
    assert first.order == 0
    assert second.order == 1
    assert first.list_id == board_list.id

    # A CREATE audit row was written for the first card (Req 8.1).
    logs = session.exec(
        select(AuditLog).where(AuditLog.entity_id == first.id)
    ).all()
    assert len(logs) == 1
    assert logs[0].action == "CREATE"
    assert logs[0].entity_type == "CARD"
    assert logs[0].entity_title == "Card A"
    assert logs[0].user_id == user.id


def test_create_card_missing_list_not_found(session: Session) -> None:
    user = _seed_user(session)
    service = TaskCardsService()
    with pytest.raises(HTTPException) as exc:
        service.create_card(
            session, CardCreate(title="x", list_id=uuid.uuid4()), user
        )
    assert exc.value.status_code == 404
    assert exc.value.detail == "List not found"
    assert session.exec(select(Card)).first() is None


def test_create_card_non_member_forbidden(session: Session) -> None:
    outsider = _seed_user(session)
    org = _seed_org(session)  # outsider is NOT a member
    board = _seed_board(session, org.id)
    board_list = _seed_list(session, board.id)

    service = TaskCardsService()
    with pytest.raises(HTTPException) as exc:
        service.create_card(
            session, CardCreate(title="x", list_id=board_list.id), outsider
        )
    assert exc.value.status_code == 403
    assert exc.value.detail == "Not a member of this organization"
    # nothing persisted
    assert session.exec(select(Card)).first() is None


def test_update_card_partial_update_and_audits(session: Session) -> None:
    user, board_list = _setup(session)
    service = TaskCardsService()
    created = service.create_card(
        session, CardCreate(title="Old", list_id=board_list.id), user
    )

    updated = service.update_card(
        session,
        created.id,
        CardUpdate(title="New title", description="Some details"),
        user,
    )
    assert updated.title == "New title"
    assert updated.description == "Some details"
    assert updated.order == created.order  # untouched field preserved

    actions = {
        log.action
        for log in session.exec(
            select(AuditLog).where(AuditLog.entity_id == created.id)
        ).all()
    }
    assert actions == {"CREATE", "UPDATE"}


def test_update_card_missing_not_found(session: Session) -> None:
    user = _seed_user(session)
    service = TaskCardsService()
    with pytest.raises(HTTPException) as exc:
        service.update_card(
            session, uuid.uuid4(), CardUpdate(title="x"), user
        )
    assert exc.value.status_code == 404
    assert exc.value.detail == "Card not found"


def test_update_card_non_member_forbidden(session: Session) -> None:
    owner, board_list = _setup(session)
    outsider = _seed_user(session)
    service = TaskCardsService()
    created = service.create_card(
        session, CardCreate(title="Owned", list_id=board_list.id), owner
    )

    with pytest.raises(HTTPException) as exc:
        service.update_card(
            session, created.id, CardUpdate(title="hijack"), outsider
        )
    assert exc.value.status_code == 403


def test_delete_card_removes_and_audits(session: Session) -> None:
    user, board_list = _setup(session)
    service = TaskCardsService()
    created = service.create_card(
        session, CardCreate(title="Temp", list_id=board_list.id), user
    )

    service.delete_card(session, created.id, user)

    # The card is gone.
    assert session.get(Card, created.id) is None
    # A DELETE audit row was written (Req 8.1) capturing the title.
    delete_logs = session.exec(
        select(AuditLog).where(
            AuditLog.entity_id == created.id, AuditLog.action == "DELETE"
        )
    ).all()
    assert len(delete_logs) == 1
    assert delete_logs[0].entity_type == "CARD"
    assert delete_logs[0].entity_title == "Temp"


def test_delete_card_missing_not_found(session: Session) -> None:
    user = _seed_user(session)
    service = TaskCardsService()
    with pytest.raises(HTTPException) as exc:
        service.delete_card(session, uuid.uuid4(), user)
    assert exc.value.status_code == 404
    assert exc.value.detail == "Card not found"


def test_list_by_list_ordered_by_order(session: Session) -> None:
    user, board_list = _setup(session)
    service = TaskCardsService()
    service.create_card(
        session, CardCreate(title="A", list_id=board_list.id), user
    )
    service.create_card(
        session, CardCreate(title="B", list_id=board_list.id), user
    )
    service.create_card(
        session, CardCreate(title="C", list_id=board_list.id), user
    )

    rows = TaskCardsRepository().list_by_list(session, board_list.id)
    orders = [row.order for row in rows]
    assert orders == sorted(orders)
    assert orders == [0, 1, 2]
    assert [row.title for row in rows] == ["A", "B", "C"]


def _seed_named_list(
    session: Session, board_id: uuid.UUID, title: str, order: int
) -> List:
    board_list = List(board_id=board_id, title=title, order=order)
    session.add(board_list)
    session.commit()
    session.refresh(board_list)
    return board_list


def test_reorder_cards_within_board_updates_order_and_list(
    session: Session,
) -> None:
    """Reorder within one board updates order + list_id and writes N audits."""
    user, list_a = _setup(session)
    list_b = _seed_named_list(session, list_a.board_id, "Doing", 1)
    service = TaskCardsService()

    card1 = service.create_card(
        session, CardCreate(title="C1", list_id=list_a.id), user
    )
    card2 = service.create_card(
        session, CardCreate(title="C2", list_id=list_a.id), user
    )

    # Swap their order, and move card2 into list_b (same board).
    result = service.reorder_cards(
        session,
        [
            CardReorderItem(id=card1.id, order=1, list_id=list_a.id),
            CardReorderItem(id=card2.id, order=0, list_id=list_b.id),
        ],
        user,
    )
    assert len(result) == 2

    refreshed1 = session.get(Card, card1.id)
    refreshed2 = session.get(Card, card2.id)
    assert refreshed1 is not None and refreshed2 is not None
    assert refreshed1.order == 1
    assert refreshed1.list_id == list_a.id
    # card2 moved to the other list in the same board.
    assert refreshed2.order == 0
    assert refreshed2.list_id == list_b.id

    # Exactly one UPDATE audit row per reordered card (Req 11.4).
    update_logs = session.exec(
        select(AuditLog).where(
            col(AuditLog.entity_id).in_([card1.id, card2.id]),
            AuditLog.action == "UPDATE",
        )
    ).all()
    assert len(update_logs) == 2
    assert {log.entity_type for log in update_logs} == {"CARD"}


def test_reorder_cards_spanning_two_boards_rejected(session: Session) -> None:
    """Cards from two different boards -> 400, DB unchanged, no audit rows."""
    user, list_a = _setup(session)
    # A second board in the SAME org, with its own list + card.
    org_id = _seed_org_for_list(session, list_a)
    board2 = _seed_board(session, org_id)
    _add_member_if_needed(session, org_id, user.id)
    list_b = _seed_named_list(session, board2.id, "Other board list", 0)

    service = TaskCardsService()
    card_a = service.create_card(
        session, CardCreate(title="A", list_id=list_a.id), user
    )
    card_b = service.create_card(
        session, CardCreate(title="B", list_id=list_b.id), user
    )

    with pytest.raises(HTTPException) as exc:
        service.reorder_cards(
            session,
            [
                CardReorderItem(id=card_a.id, order=1, list_id=list_a.id),
                CardReorderItem(id=card_b.id, order=0, list_id=list_b.id),
            ],
            user,
        )
    assert exc.value.status_code == 400
    assert exc.value.detail == "Invalid reorder payload"

    # DB unchanged: orders preserved.
    assert session.get(Card, card_a.id).order == 0
    assert session.get(Card, card_b.id).order == 0
    # No UPDATE audit rows were written.
    update_logs = session.exec(
        select(AuditLog).where(AuditLog.action == "UPDATE")
    ).all()
    assert update_logs == []


def test_reorder_cards_unknown_id_rejected(session: Session) -> None:
    """An unknown card id -> 400 and the DB is left unchanged."""
    user, list_a = _setup(session)
    service = TaskCardsService()
    card = service.create_card(
        session, CardCreate(title="C", list_id=list_a.id), user
    )

    with pytest.raises(HTTPException) as exc:
        service.reorder_cards(
            session,
            [
                CardReorderItem(id=card.id, order=1, list_id=list_a.id),
                CardReorderItem(id=uuid.uuid4(), order=0, list_id=list_a.id),
            ],
            user,
        )
    assert exc.value.status_code == 400
    assert exc.value.detail == "Invalid reorder payload"
    # Original card order untouched.
    assert session.get(Card, card.id).order == 0


def _seed_org_for_list(session: Session, board_list: List) -> uuid.UUID:
    """Return the org id owning ``board_list`` (via its board)."""
    board = session.get(Board, board_list.board_id)
    assert board is not None
    return board.org_id


def _add_member_if_needed(
    session: Session, org_id: uuid.UUID, user_id: uuid.UUID
) -> None:
    existing = session.exec(
        select(OrganizationMember).where(
            OrganizationMember.org_id == org_id,
            OrganizationMember.user_id == user_id,
        )
    ).first()
    if existing is None:
        _add_member(session, org_id, user_id)


def test_copy_card_duplicates_with_copy_suffix_appended(session: Session) -> None:
    """copy_card creates "{title} - Copy" in the same list at order max+1,
    copies the description, and writes a CREATE audit row (Req 7.6, 8.1)."""
    user, board_list = _setup(session)
    service = TaskCardsService()

    source = service.create_card(
        session, CardCreate(title="Original", list_id=board_list.id), user
    )
    # Give the source a description and a sibling so max_order advances.
    service.update_card(
        session, source.id, CardUpdate(description="Some details"), user
    )
    service.create_card(
        session, CardCreate(title="Sibling", list_id=board_list.id), user
    )

    copy = service.copy_card(session, source.id, user)

    # Title gets the " - Copy" suffix, same list, appended at max_order + 1.
    assert copy.title == "Original - Copy"
    assert copy.list_id == board_list.id
    assert copy.order == 2  # source=0, sibling=1, copy appended at 2
    # Description is copied across (Req 7.6).
    assert copy.description == "Some details"
    # The source card is left untouched.
    assert session.get(Card, source.id).title == "Original"

    # A CREATE audit row was written for the NEW card (Req 8.1).
    logs = session.exec(
        select(AuditLog).where(
            AuditLog.entity_id == copy.id, AuditLog.action == "CREATE"
        )
    ).all()
    assert len(logs) == 1
    assert logs[0].entity_type == "CARD"
    assert logs[0].entity_title == "Original - Copy"
    assert logs[0].user_id == user.id


def test_copy_card_missing_not_found(session: Session) -> None:
    user = _seed_user(session)
    service = TaskCardsService()
    with pytest.raises(HTTPException) as exc:
        service.copy_card(session, uuid.uuid4(), user)
    assert exc.value.status_code == 404
    assert exc.value.detail == "Card not found"
    assert session.exec(select(Card)).first() is None


def test_copy_card_non_member_forbidden(session: Session) -> None:
    owner, board_list = _setup(session)
    outsider = _seed_user(session)
    service = TaskCardsService()
    source = service.create_card(
        session, CardCreate(title="Owned", list_id=board_list.id), owner
    )

    with pytest.raises(HTTPException) as exc:
        service.copy_card(session, source.id, outsider)
    assert exc.value.status_code == 403
    assert exc.value.detail == "Not a member of this organization"
    # No copy was persisted: only the original card exists.
    assert len(session.exec(select(Card)).all()) == 1
