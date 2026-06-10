"""organizations schema layer.

Pydantic request/response schemas for the ``organizations`` domain.

- ``OrganizationCreate``: request body for creating an organization. Carries
  only ``name`` — the service is responsible for initializing the owning
  membership, ``OrgLimit`` and ``OrgSubscription`` (Req 3.6).
- ``OrganizationPublic``: API response shape. It extends ``CamelModel`` so
  fields serialize to camelCase (``createdAt``, ``updatedAt``).

See requirements 3.2, 3.5 and design.md section "2. Serialization camelCase".
"""

import uuid
from datetime import datetime

from sqlmodel import Field, SQLModel

from app.core.base import CamelModel


class OrganizationCreate(SQLModel):
    """Request body for creating an organization."""

    name: str = Field(min_length=1, max_length=255)


class OrganizationPublic(CamelModel):
    """API response for an organization.

    Serializes to camelCase: ``createdAt``, ``updatedAt``.
    """

    id: uuid.UUID
    name: str
    created_at: datetime
    updated_at: datetime
