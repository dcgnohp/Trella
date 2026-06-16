"""board_lists router layer.

FastAPI ``APIRouter`` for the ``board_lists`` domain.

Although the Python domain is named ``board_lists`` internally, the
frontend-facing resource is a ``List`` and the public routes stay under the
``/lists`` prefix (the global ``/api/v1`` prefix is added later at
``app/api/main.py`` by task 16.1):

- ``POST /lists`` (full path ``/api/v1/lists``): create a list at the end of its
  board. Delegates to ``BoardListsService.create_list`` which enforces
  org-membership (HTTP 403 for non-members), derives ``order`` =
  ``max_order(board) + 1`` and records a CREATE audit row. Returns the created
  list as ``ListPublic`` (camelCase) — Req 6.1.
- ``PATCH /lists/reorder`` (full path ``/api/v1/lists/reorder``): atomically
  apply a new ``order`` to every list of a board via
  ``BoardListsService.reorder_lists``. Returns the updated ``list[ListPublic]``
  — Req 6.4. This route is declared BEFORE ``/lists/{list_id}`` so the literal
  ``reorder`` is not captured as a ``list_id`` path parameter.
- ``PATCH /lists/{list_id}`` (full path ``/api/v1/lists/{list_id}``): apply a
  partial update via ``BoardListsService.update_list`` and return the updated
  list as ``ListPublic`` — Req 6.2.
- ``DELETE /lists/{list_id}`` (full path ``/api/v1/lists/{list_id}``): delete the
  list (cascading to its cards) and record a DELETE audit row via
  ``BoardListsService.delete_list``. Returns HTTP 204 No Content — Req 6.3.
- ``POST /lists/{list_id}/copy`` (full path ``/api/v1/lists/{list_id}/copy``):
  duplicate a list and its cards into the same board via
  ``BoardListsService.copy_list``. Returns the new list as ``ListPublic``
  — Req 6.6.

All endpoints require an authenticated user resolved by the ``get_current_user``
dependency (``CurrentUser``). Org-scoping (HTTP 403 "Not a member of this
organization") and not-found (HTTP 404) handling live in the service. See
requirements 6.1, 6.2, 6.3, 6.4, 6.6 and design.md sections "Components and
Interfaces".
"""

import uuid

from fastapi import APIRouter, status

from app.core.deps import CurrentUser, SessionDep
from app.schemas.board_lists_schema import (
    ListCreate,
    ListPublic,
    ListReorder,
    ListUpdate,
)
from app.services.board_lists_service import BoardListsService

router = APIRouter(prefix="/lists", tags=["lists"])

_service = BoardListsService()


@router.post("", response_model=ListPublic)
def create_list(
    session: SessionDep,
    data: ListCreate,
    current_user: CurrentUser,
) -> ListPublic:
    """Create a list at the end of its board (Req 6.1).

    Delegates to ``BoardListsService.create_list`` which enforces org-membership
    (HTTP 403 for non-members), returns HTTP 404 "Board not found" when the
    board does not exist, derives ``order`` = ``max_order(board) + 1`` and
    records a CREATE audit row — all atomically. Returns ``ListPublic``.
    """
    board_list = _service.create_list(session, data, current_user)
    return ListPublic.model_validate(board_list)


@router.patch("/reorder", response_model=list[ListPublic])
def reorder_lists(
    session: SessionDep,
    data: ListReorder,
    current_user: CurrentUser,
) -> list[ListPublic]:
    """Atomically apply a new ``order`` to every list of a board (Req 6.4).

    Declared BEFORE ``/lists/{list_id}`` so ``reorder`` is matched as a literal
    path and not captured as a ``list_id``. Delegates to
    ``BoardListsService.reorder_lists`` which enforces org-membership (HTTP 403),
    validates the payload before touching the DB (HTTP 400 "Invalid reorder
    payload") and applies all updates in a single transaction. Returns the
    updated ``list[ListPublic]``.
    """
    board_lists = _service.reorder_lists(
        session, data.board_id, data.items, current_user
    )
    return [ListPublic.model_validate(board_list) for board_list in board_lists]


@router.patch("/{list_id}", response_model=ListPublic)
def update_list(
    session: SessionDep,
    list_id: uuid.UUID,
    data: ListUpdate,
    current_user: CurrentUser,
) -> ListPublic:
    """Apply a partial update to a list and return it (Req 6.2).

    Delegates to ``BoardListsService.update_list`` which enforces org-membership
    (HTTP 403 for non-members), returns HTTP 404 "List not found" when the list
    does not exist, applies only the provided fields and records an UPDATE audit
    row.
    """
    board_list = _service.update_list(session, list_id, data, current_user)
    return ListPublic.model_validate(board_list)


@router.delete("/{list_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_list(
    session: SessionDep,
    list_id: uuid.UUID,
    current_user: CurrentUser,
) -> None:
    """Delete a list and its cards, returning HTTP 204 (Req 6.3).

    Delegates to ``BoardListsService.delete_list`` which enforces org-membership
    (HTTP 403 for non-members), returns HTTP 404 "List not found" when the list
    does not exist, cascades the delete to the list's cards and records a DELETE
    audit row — all atomically.
    """
    _service.delete_list(session, list_id, current_user)


@router.post("/{list_id}/copy", response_model=ListPublic)
def copy_list(
    session: SessionDep,
    list_id: uuid.UUID,
    current_user: CurrentUser,
) -> ListPublic:
    """Duplicate a list and its cards into the same board (Req 6.6).

    Delegates to ``BoardListsService.copy_list`` which enforces org-membership
    (HTTP 403 for non-members), returns HTTP 404 "List not found" when the list
    does not exist, appends the copy at the end of the same board (title
    ``"{source} - Copy"``), copies the cards preserving order and records a
    CREATE audit row — all atomically. Returns the new ``ListPublic``.
    """
    board_list = _service.copy_list(session, list_id, current_user)
    return ListPublic.model_validate(board_list)
