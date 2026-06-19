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
    """Raise HTTP 403 if user is not a member of the board's org."""
    board_list = _service.create_list(session, data, current_user)
    return ListPublic.model_validate(board_list)


@router.patch("/reorder", response_model=list[ListPublic])
def reorder_lists(
    session: SessionDep,
    data: ListReorder,
    current_user: CurrentUser,
) -> list[ListPublic]:
    """Declared before /{list_id} so 'reorder' is not captured as a path parameter."""
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
    """Raise HTTP 403 if user is not a member, HTTP 404 if list not found."""
    board_list = _service.update_list(session, list_id, data, current_user)
    return ListPublic.model_validate(board_list)


@router.delete("/{list_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_list(
    session: SessionDep,
    list_id: uuid.UUID,
    current_user: CurrentUser,
) -> None:
    """Delete a list and its cards, returning HTTP 204."""
    _service.delete_list(session, list_id, current_user)


@router.post("/{list_id}/copy", response_model=ListPublic)
def copy_list(
    session: SessionDep,
    list_id: uuid.UUID,
    current_user: CurrentUser,
) -> ListPublic:
    """Raise HTTP 403 if user is not a member, HTTP 404 if list not found."""
    board_list = _service.copy_list(session, list_id, current_user)
    return ListPublic.model_validate(board_list)
