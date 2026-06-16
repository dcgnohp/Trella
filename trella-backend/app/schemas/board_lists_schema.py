"""board_lists schema layer.

Pydantic request/response schemas for the ``board_lists`` domain.

All schemas extend ``CamelModel`` so snake_case fields serialize to camelCase
aliases (``board_id`` -> ``boardId``, ``created_at`` -> ``createdAt``) while
still accepting snake_case input thanks to ``populate_by_name=True``
(design.md section "2. Serialization camelCase").

The frontend-facing domain type is ``List`` even though the Python domain is
named ``board_lists`` internally; these schemas keep the frontend field names.

- ``ListCreate``: request body for creating a list (``title``, ``boardId``). The
  service assigns ``order`` = ``max_order(board) + 1`` (Req 6.1).
- ``ListUpdate``: request body for ``PATCH /lists/{id}`` — every field optional
  so callers send only what changes (Req 6.2).
- ``ListPublic``: flat list response with ``id``, ``title``, ``order``,
  ``boardId``, ``createdAt``, ``updatedAt`` (Req 6.7).
- ``ListReorderItem``: a single ``{id, order}`` entry of a reorder payload.
- ``ListReorder``: request body for ``PATCH /lists/reorder`` — a ``boardId`` plus
  the ``items`` array; the service updates every list's ``order`` atomically
  (Req 6.4, 6.5, 11.1-11.4).

See requirements 6.1, 6.4, 6.5, 6.7, 11.1, 11.2, 11.3, 11.4.
"""

import uuid
from datetime import datetime

from pydantic import Field

from app.core.base import CamelModel


class ListCreate(CamelModel):
    """Request body for creating a list.

    Accepts camelCase (``boardId``) and, thanks to ``populate_by_name=True``, the
    snake_case field names too. ``order`` is NOT accepted from the client — the
    service derives it as ``max_order(board) + 1`` (Req 6.1).
    """

    title: str = Field(min_length=1, max_length=255)
    board_id: uuid.UUID


class ListUpdate(CamelModel):
    """Request body for ``PATCH /lists/{id}`` (Req 6.2).

    All fields are optional so the client can send a partial update; the service
    applies only the provided fields.
    """

    title: str | None = Field(default=None, min_length=1, max_length=255)
    order: int | None = None


class ListPublic(CamelModel):
    """Flat API response for a list (Req 6.7).

    Serializes to camelCase: ``boardId``, ``createdAt``, ``updatedAt``.
    """

    id: uuid.UUID
    title: str
    order: int
    board_id: uuid.UUID
    created_at: datetime
    updated_at: datetime


class ListReorderItem(CamelModel):
    """A single ``{id, order}`` entry of a reorder payload (Req 6.4)."""

    id: uuid.UUID
    order: int


class ListReorder(CamelModel):
    """Request body for ``PATCH /lists/reorder`` (Req 6.4, 6.5, 11.1-11.4).

    Carries the target ``boardId`` and the ``items`` whose ``order`` should be
    applied. The service validates that every id belongs to ``boardId`` before
    touching the DB and applies all updates in a single transaction.
    """

    board_id: uuid.UUID
    items: list[ListReorderItem]
