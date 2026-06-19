import uuid
from datetime import datetime

from pydantic import Field

from app.core.base import CamelModel


class BoardCreate(CamelModel):
    org_id: uuid.UUID
    title: str = Field(min_length=1, max_length=255)
    image_id: str | None = None
    image_thumb_url: str | None = None
    image_full_url: str | None = None
    image_user_name: str | None = None
    image_link_html: str | None = Field(default=None, alias="imageLinkHTML")


class BoardUpdate(CamelModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    image_id: str | None = None
    image_thumb_url: str | None = None
    image_full_url: str | None = None
    image_user_name: str | None = None
    image_link_html: str | None = Field(default=None, alias="imageLinkHTML")


class BoardPublic(CamelModel):
    id: uuid.UUID
    org_id: uuid.UUID
    project_id: uuid.UUID
    title: str
    image_id: str | None = None
    image_thumb_url: str | None = None
    image_full_url: str | None = None
    image_user_name: str | None = None
    image_link_html: str | None = Field(default=None, alias="imageLinkHTML")
    created_at: datetime
    updated_at: datetime


class CardPublic(CamelModel):
    id: uuid.UUID
    title: str
    order: int
    description: str | None = None
    list_id: uuid.UUID
    created_at: datetime
    updated_at: datetime


class ListWithCards(CamelModel):
    id: uuid.UUID
    title: str
    order: int
    board_id: uuid.UUID
    cards: list[CardPublic] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class BoardDetail(BoardPublic):
    lists: list[ListWithCards] = Field(default_factory=list)
