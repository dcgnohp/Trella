import uuid

from fastapi import APIRouter, status

from app.core.deps import CurrentUser, SessionDep
from app.schemas.task_cards_schema import (
    CardCreate,
    CardPublic,
    CardReorder,
    CardUpdate,
)
from app.services.task_cards_service import TaskCardsService

router = APIRouter(prefix="/cards", tags=["cards"])

_service = TaskCardsService()


@router.post("", response_model=CardPublic)
def create_card(
    session: SessionDep,
    data: CardCreate,
    current_user: CurrentUser,
) -> CardPublic:
    card = _service.create_card(session, data, current_user)
    return CardPublic.model_validate(card)


@router.patch("/reorder", response_model=list[CardPublic])
def reorder_cards(
    session: SessionDep,
    data: CardReorder,
    current_user: CurrentUser,
) -> list[CardPublic]:
    # Declared before /{card_id} so "reorder" is not captured as a path parameter.
    cards = _service.reorder_cards(session, data.items, current_user)
    return [CardPublic.model_validate(card) for card in cards]


@router.patch("/{card_id}", response_model=CardPublic)
def update_card(
    session: SessionDep,
    card_id: uuid.UUID,
    data: CardUpdate,
    current_user: CurrentUser,
) -> CardPublic:
    card = _service.update_card(session, card_id, data, current_user)
    return CardPublic.model_validate(card)


@router.delete("/{card_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_card(
    session: SessionDep,
    card_id: uuid.UUID,
    current_user: CurrentUser,
) -> None:
    _service.delete_card(session, card_id, current_user)


@router.post("/{card_id}/copy", response_model=CardPublic)
def copy_card(
    session: SessionDep,
    card_id: uuid.UUID,
    current_user: CurrentUser,
) -> CardPublic:
    card = _service.copy_card(session, card_id, current_user)
    return CardPublic.model_validate(card)
