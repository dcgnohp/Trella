"""boards schema layer.

Pydantic request/response schemas for the ``boards`` domain.

All schemas extend ``CamelModel`` so snake_case fields serialize to camelCase
aliases (``org_id`` -> ``orgId``, ``image_thumb_url`` -> ``imageThumbUrl``,
``created_at`` -> ``createdAt``) while still accepting snake_case input thanks to
``populate_by_name=True`` (design.md section "2. Serialization camelCase").

Note on ``image_link_html``: the auto camelCase generator would yield
``imageLinkHtml``, but the frontend contract (Req 5.1 / 5.7) uses
``imageLinkHTML``. We therefore pin that single field's alias explicitly.

Domain types facing the frontend are ``Board`` / ``List`` / ``Card``; the Python
domains are named ``boards`` / ``board_lists`` / ``task_cards`` internally but the
response shapes here keep the frontend names (``CardPublic``, ``ListWithCards``).

- ``BoardCreate``: request body for creating a board (camelCase input).
- ``BoardUpdate``: partial request body for updating a board (Req 5.3).
- ``BoardPublic``: flat board response (Req 5.7).
- ``CardPublic`` / ``ListWithCards``: response-shape building blocks for the
  nested board detail. They are shape definitions only here — the list/card
  domains own their tables (tasks 14.1 / 15.1).
- ``BoardDetail``: ``BoardPublic`` plus nested ``lists`` (each with ``cards``),
  used by ``GET /boards/{id}`` (Req 5.2, design.md section "3. Nested response").

See requirements 5.1, 5.7, 4.3.
"""

import uuid
from datetime import datetime

from pydantic import Field

from app.core.base import CamelModel


class BoardCreate(CamelModel):
    """Request body for creating a board.

    Accepts camelCase (``orgId``, ``imageThumbUrl``, ``imageLinkHTML``, ...) and,
    thanks to ``populate_by_name=True``, the snake_case field names too. Image
    fields are optional cover-image metadata.
    """

    org_id: uuid.UUID
    title: str = Field(min_length=1, max_length=255)
    image_id: str | None = None
    image_thumb_url: str | None = None
    image_full_url: str | None = None
    image_user_name: str | None = None
    image_link_html: str | None = Field(default=None, alias="imageLinkHTML")


class BoardUpdate(CamelModel):
    """Request body for updating a board (Req 5.3).

    All fields are optional so callers can send a partial update (PATCH
    semantics). Accepts camelCase (``imageThumbUrl``, ``imageLinkHTML``, ...) and,
    thanks to ``populate_by_name=True``, the snake_case field names too. The
    service applies only the fields that were explicitly provided
    (``model_dump(exclude_unset=True)``). ``org_id`` is intentionally absent: a
    board cannot be moved between organizations.
    """

    title: str | None = Field(default=None, min_length=1, max_length=255)
    image_id: str | None = None
    image_thumb_url: str | None = None
    image_full_url: str | None = None
    image_user_name: str | None = None
    image_link_html: str | None = Field(default=None, alias="imageLinkHTML")


class BoardPublic(CamelModel):
    """Flat API response for a board (Req 5.7).

    Serializes to camelCase: ``orgId``, ``imageId``, ``imageThumbUrl``,
    ``imageFullUrl``, ``imageUserName``, ``imageLinkHTML``, ``createdAt``,
    ``updatedAt``.
    """

    id: uuid.UUID
    org_id: uuid.UUID
    title: str
    image_id: str | None = None
    image_thumb_url: str | None = None
    image_full_url: str | None = None
    image_user_name: str | None = None
    image_link_html: str | None = Field(default=None, alias="imageLinkHTML")
    created_at: datetime
    updated_at: datetime


class CardPublic(CamelModel):
    """Response shape for a card nested under a list (frontend type ``Card``).

    Serializes to camelCase: ``listId``, ``createdAt``, ``updatedAt``. This is a
    response-shape definition only; the card table is owned by the task_cards
    domain (task 15.1).
    """

    id: uuid.UUID
    title: str
    order: int
    description: str | None = None
    list_id: uuid.UUID
    created_at: datetime
    updated_at: datetime


class ListWithCards(CamelModel):
    """Response shape for a list with its ordered cards (frontend type ``List``).

    Serializes to camelCase: ``boardId``, ``createdAt``, ``updatedAt``. ``cards``
    are expected to be ordered by ``order`` ascending by the service (Req 5.2).
    """

    id: uuid.UUID
    title: str
    order: int
    board_id: uuid.UUID
    cards: list[CardPublic] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class BoardDetail(BoardPublic):
    """Nested board response for ``GET /boards/{id}`` (Req 5.2).

    Extends ``BoardPublic`` with ``lists`` ordered by ``order`` ascending, each
    carrying its ``cards`` ordered by ``order`` ascending. The service is
    responsible for loading and sorting (design.md section "3. Nested response").
    """

    lists: list[ListWithCards] = Field(default_factory=list)
