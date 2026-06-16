"""task_cards router layer.

FastAPI ``APIRouter`` for the ``task_cards`` domain.

Although the Python domain is named ``task_cards`` internally, the
frontend-facing resource is a ``Card`` and the public routes stay under the
``/cards`` prefix (the global ``/api/v1`` prefix is added later at
``app/api/main.py`` by task 16.1):

- ``POST /cards`` (full path ``/api/v1/cards``): create a card at the end of its
  list. Delegates to ``TaskCardsService.create_card`` which enforces
  org-membership (HTTP 403 for non-members), derives ``order`` =
  ``max_order(list) + 1`` and records a CREATE audit row. Returns the created
  card as ``CardPublic`` (camelCase) — Req 7.1.
- ``PATCH /cards/reorder`` (full path ``/api/v1/cards/reorder``): atomically
  apply a new ``order`` (and target list) to a set of cards via
  ``TaskCardsService.reorder_cards``. The request body is ``CardReorder``; its
  ``items`` are forwarded to the service. Returns the updated
  ``list[CardPublic]`` — Req 7.4. This route is declared BEFORE
  ``/cards/{card_id}`` so the literal ``reorder`` is not captured as a
  ``card_id`` path parameter.
- ``PATCH /cards/{card_id}`` (full path ``/api/v1/cards/{card_id}``): apply a
  partial update via ``TaskCardsService.update_card`` and return the updated
  card as ``CardPublic`` — Req 7.2.
- ``DELETE /cards/{card_id}`` (full path ``/api/v1/cards/{card_id}``): delete the
  card and record a DELETE audit row via ``TaskCardsService.delete_card``.
  Returns HTTP 204 No Content — Req 7.3.
- ``POST /cards/{card_id}/copy`` (full path ``/api/v1/cards/{card_id}/copy``):
  duplicate a card within the same list via ``TaskCardsService.copy_card``.
  Returns the new card as ``CardPublic`` — Req 7.6.

All endpoints require an authenticated user resolved by the ``get_current_user``
dependency (``CurrentUser``). Org-scoping (HTTP 403 "Not a member of this
organization") and not-found (HTTP 404) handling live in the service. See
requirements 7.1, 7.2, 7.3, 7.4, 7.6 and design.md sections "Components and
Interfaces".
"""

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
    """Create a card at the end of its list (Req 7.1).

    Delegates to ``TaskCardsService.create_card`` which enforces org-membership
    (HTTP 403 for non-members), returns HTTP 404 "List not found" / "Board not
    found" when the owning list/board does not exist, derives ``order`` =
    ``max_order(list) + 1`` and records a CREATE audit row — all atomically.
    Returns ``CardPublic``.
    """
    card = _service.create_card(session, data, current_user)
    return CardPublic.model_validate(card)


@router.patch("/reorder", response_model=list[CardPublic])
def reorder_cards(
    session: SessionDep,
    data: CardReorder,
    current_user: CurrentUser,
) -> list[CardPublic]:
    """Atomically apply a new ``order`` (and target list) to a set of cards
    (Req 7.4).

    Declared BEFORE ``/cards/{card_id}`` so ``reorder`` is matched as a literal
    path and not captured as a ``card_id``. Delegates to
    ``TaskCardsService.reorder_cards`` (forwarding ``data.items``) which enforces
    org-membership (HTTP 403), validates that every card and every target list
    belong to the same Board before touching the DB (HTTP 400 "Invalid reorder
    payload") and applies all updates in a single transaction. Returns the
    updated ``list[CardPublic]``.
    """
    cards = _service.reorder_cards(session, data.items, current_user)
    return [CardPublic.model_validate(card) for card in cards]


@router.patch("/{card_id}", response_model=CardPublic)
def update_card(
    session: SessionDep,
    card_id: uuid.UUID,
    data: CardUpdate,
    current_user: CurrentUser,
) -> CardPublic:
    """Apply a partial update to a card and return it (Req 7.2).

    Delegates to ``TaskCardsService.update_card`` which enforces org-membership
    (HTTP 403 for non-members), returns HTTP 404 "Card not found" when the card
    does not exist, applies only the provided fields and records an UPDATE audit
    row.
    """
    card = _service.update_card(session, card_id, data, current_user)
    return CardPublic.model_validate(card)


@router.delete("/{card_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_card(
    session: SessionDep,
    card_id: uuid.UUID,
    current_user: CurrentUser,
) -> None:
    """Delete a card, returning HTTP 204 (Req 7.3).

    Delegates to ``TaskCardsService.delete_card`` which enforces org-membership
    (HTTP 403 for non-members), returns HTTP 404 "Card not found" when the card
    does not exist, records a DELETE audit row and removes the card — all
    atomically.
    """
    _service.delete_card(session, card_id, current_user)


@router.post("/{card_id}/copy", response_model=CardPublic)
def copy_card(
    session: SessionDep,
    card_id: uuid.UUID,
    current_user: CurrentUser,
) -> CardPublic:
    """Duplicate a card within the same list (Req 7.6).

    Delegates to ``TaskCardsService.copy_card`` which enforces org-membership
    (HTTP 403 for non-members), returns HTTP 404 "Card not found" when the card
    does not exist, appends the copy at the end of the same list (title
    ``"{source} - Copy"``, copying the description) and records a CREATE audit
    row — all atomically. Returns the new ``CardPublic``.
    """
    card = _service.copy_card(session, card_id, current_user)
    return CardPublic.model_validate(card)
