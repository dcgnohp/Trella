"""org_limits schema layer.

Pydantic request/response schemas for the ``org_limits`` domain.

- ``OrgLimitPublic``: API response shape. Extends ``CamelModel`` so fields
  serialize to camelCase (``orgId``, ``count``, ``createdAt``, ``updatedAt``).

See requirements 9.2-9.6 and design.md section "2. Serialization camelCase".
"""

import uuid
from datetime import datetime

from app.core.base import CamelModel


class OrgLimitPublic(CamelModel):
    """API response for an organization board limit.

    Serializes to camelCase: ``orgId``, ``count``, ``createdAt``, ``updatedAt``.
    """

    id: uuid.UUID
    org_id: uuid.UUID
    count: int
    created_at: datetime
    updated_at: datetime
