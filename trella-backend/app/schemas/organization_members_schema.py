"""organization_members schema layer.

Pydantic request/response schemas for the ``organization_members`` domain.

- ``OrganizationMemberPublic``: API response shape. It extends ``CamelModel`` so
  fields serialize to camelCase (``userId``, ``orgId``, ``createdAt``,
  ``updatedAt``).

See requirements 3.2, 4.1, 4.2, 4.4 and design.md section
"2. Serialization camelCase".
"""

import uuid
from datetime import datetime

from app.core.base import CamelModel


class OrganizationMemberPublic(CamelModel):
    """API response for an organization membership.

    Serializes to camelCase: ``userId``, ``orgId``, ``createdAt``,
    ``updatedAt``.
    """

    id: uuid.UUID
    user_id: uuid.UUID
    org_id: uuid.UUID
    role: str
    created_at: datetime
    updated_at: datetime
