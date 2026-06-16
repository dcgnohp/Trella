"""boards router layer.

FastAPI ``APIRouter`` for the ``boards`` domain.

Exposes the board create/list/detail/update/delete endpoints under the
``/boards`` prefix (the global ``/api/v1`` prefix is added later at
``app/api/main.py`` by task 16.1):

- ``POST /boards`` (full path ``/api/v1/boards``): create a board for an
  organization the current user is a member of. Delegates to
  ``BoardsService.create_board`` which enforces org-membership, the free-tier
  board cap, increments ``OrgLimit.count`` and records a CREATE audit row.
  Returns the created board as ``BoardPublic`` (camelCase) — Req 5.1.
- ``GET /boards?orgId=...`` (full path ``/api/v1/boards``): list the boards of
  an organization the current user is a member of, via
  ``BoardsService.list_boards`` (org-scoped, HTTP 403 for non-members — Req 4).
  Returns ``list[BoardPublic]``.
- ``GET /boards/{board_id}`` (full path ``/api/v1/boards/{board_id}``): return
  the board with its lists and cards nested, each ordered by ``order`` ascending,
  via ``BoardsService.get_board_detail``. Returns ``BoardDetail`` — Req 5.2.
- ``PATCH /boards/{board_id}`` (full path ``/api/v1/boards/{board_id}``): apply a
  partial update via ``BoardsService.update_board`` and return the updated board
  as ``BoardPublic`` — Req 5.3.
- ``DELETE /boards/{board_id}`` (full path ``/api/v1/boards/{board_id}``): delete
  the board (cascading to its lists/cards), decrement ``OrgLimit.count`` and
  record a DELETE audit row via ``BoardsService.delete_board``. Returns HTTP 204
  No Content — Req 5.4.

All endpoints require an authenticated user resolved by the ``get_current_user``
dependency (``CurrentUser``). Org-scoping (HTTP 403 "Not a member of this
organization") and not-found (HTTP 404) handling live in the service. See
requirements 5.1, 5.2, 5.3, 5.4 and design.md sections "Components and
Interfaces" + "3. Nested response cho GET board".
"""

import uuid

from fastapi import APIRouter, Query, status

from app.core.deps import CurrentUser, SessionDep
from app.schemas.boards_schema import (
    BoardCreate,
    BoardDetail,
    BoardPublic,
    BoardUpdate,
)
from app.services.boards_service import BoardsService

router = APIRouter(prefix="/boards", tags=["boards"])

_service = BoardsService()


@router.post("", response_model=BoardPublic)
def create_board(
    session: SessionDep,
    data: BoardCreate,
    current_user: CurrentUser,
) -> BoardPublic:
    """Create a board for an organization the current user is a member of.

    Delegates to ``BoardsService.create_board`` which enforces org-membership
    (HTTP 403 for non-members), the free-tier cap (HTTP 403 "Free tier board
    limit reached"), increments ``OrgLimit.count`` and records a CREATE audit row
    — all atomically (Req 5.1, 5.5, 5.6, 8.1). Returns ``BoardPublic``.
    """
    board = _service.create_board(session, data, current_user)
    return BoardPublic.model_validate(board)


@router.get("", response_model=list[BoardPublic])
def list_boards(
    session: SessionDep,
    current_user: CurrentUser,
    org_id: uuid.UUID = Query(alias="orgId"),
) -> list[BoardPublic]:
    """List the boards of an organization the current user is a member of.

    Requires ``orgId``; enforces org-scoping via ``BoardsService.list_boards``
    (HTTP 403 "Not a member of this organization" for non-members — Req 4).
    """
    boards = _service.list_boards(session, org_id, current_user)
    return [BoardPublic.model_validate(board) for board in boards]


@router.get("/{board_id}", response_model=BoardDetail)
def get_board(
    session: SessionDep,
    board_id: uuid.UUID,
    current_user: CurrentUser,
) -> BoardDetail:
    """Return a board with its lists and cards nested, ascending by ``order``.

    Delegates to ``BoardsService.get_board_detail`` which enforces org-scoping
    (HTTP 403 for non-members), returns HTTP 404 when the board does not exist,
    and orders ``lists`` and each list's ``cards`` ascending by ``order``
    (Req 5.2).
    """
    return _service.get_board_detail(session, board_id, current_user)


@router.patch("/{board_id}", response_model=BoardPublic)
def update_board(
    session: SessionDep,
    board_id: uuid.UUID,
    data: BoardUpdate,
    current_user: CurrentUser,
) -> BoardPublic:
    """Apply a partial update to a board and return it (Req 5.3).

    Delegates to ``BoardsService.update_board`` which enforces org-scoping
    (HTTP 403 for non-members), returns HTTP 404 when the board does not exist,
    applies only the provided fields and records an UPDATE audit row.
    """
    board = _service.update_board(session, board_id, data, current_user)
    return BoardPublic.model_validate(board)


@router.delete("/{board_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_board(
    session: SessionDep,
    board_id: uuid.UUID,
    current_user: CurrentUser,
) -> None:
    """Delete a board and its descendants, returning HTTP 204 (Req 5.4).

    Delegates to ``BoardsService.delete_board`` which enforces org-scoping
    (HTTP 403 for non-members), returns HTTP 404 when the board does not exist,
    cascades the delete to the board's lists/cards, decrements ``OrgLimit.count``
    and records a DELETE audit row — all atomically.
    """
    _service.delete_board(session, board_id, current_user)
