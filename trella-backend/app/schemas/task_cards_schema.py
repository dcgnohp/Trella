"""task_cards schema layer.

Pydantic request/response schemas for the ``task_cards`` domain.

All schemas extend ``CamelModel`` so snake_case fields serialize to camelCase
aliases (``list_id`` -> ``listId``, ``created_at`` -> ``createdAt``) while still
accepting snake_case input thanks to ``populate_by_name=True`` (design.md
section "2. Serialization camelCase").

The frontend-facing domain type is ``Card`` even though the Python domain is
named ``task_cards`` internally; these schemas keep the frontend field names.

- ``CardCreate``: request body for creating a card (``title``, ``listId``). The
  service assigns ``order`` = ``max_order(list) + 1`` (Req 7.1).
- ``CardUpdate``: request body for ``PATCH /cards/{id}`` — ``title`` and
  ``description`` optional so callers send only what changes (Req 7.2).
- ``CardPublic``: flat card response with ``id``, ``title``, ``order``,
  ``description``, ``listId``, ``createdAt``, ``updatedAt`` (Req 7.7).
- ``CardReorderItem``: a single ``{id, order, listId}`` entry of a reorder
  payload. Unlike a list reorder entry, a card entry carries the TARGET
  ``listId`` because a card can move across lists during a reorder (Req 7.4).
- ``CardReorder``: request body for ``PATCH /cards/reorder`` — the ``items``
  array; the service validates every card (and target list) belongs to the same
  Board before applying all updates atomically (Req 7.4, 7.5, 11.1-11.4).

See requirements 7.1, 7.4, 7.5, 7.7, 11.1, 11.2, 11.3, 11.4.
"""

import uuid
from datetime import datetime

from pydantic import Field

from app.core.base import CamelModel


class CardCreate(CamelModel):
    """Request body for creating a card.

    Accepts camelCase (``listId``) and, thanks to ``populate_by_name=True``, the
    snake_case field names too. ``order`` is NOT accepted from the client — the
    service derives it as ``max_order(list) + 1`` (Req 7.1).
    """

    title: str = Field(min_length=1, max_length=255)
    list_id: uuid.UUID


class CardUpdate(CamelModel):
    """Request body for ``PATCH /cards/{id}`` (Req 7.2).

    ``title`` and ``description`` are optional so the client can send a partial
    update; the service applies only the provided fields.
    """

    title: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None


class CardPublic(CamelModel):
    """Flat API response for a card (Req 7.7).

    Serializes to camelCase: ``listId``, ``createdAt``, ``updatedAt``.
    """

    id: uuid.UUID
    title: str
    order: int
    description: str | None
    list_id: uuid.UUID
    created_at: datetime
    updated_at: datetime


class CardReorderItem(CamelModel):
    """A single ``{id, order, listId}`` entry of a card reorder payload.

    Unlike a list reorder entry, a card entry carries the TARGET ``listId``
    because a card can move across lists (within the same Board) during a
    reorder (Req 7.4).
    """

    id: uuid.UUID
    order: int
    list_id: uuid.UUID


class CardReorder(CamelModel):
    """Request body for ``PATCH /cards/reorder`` (Req 7.4, 7.5, 11.1-11.4).

    Carries the ``items`` whose ``order`` and ``listId`` should be applied. The
    service validates that every card (resolved through its current list) and
    every target ``listId`` belong to the SAME Board before applying all updates
    in a single transaction.
    """

    items: list[CardReorderItem]
