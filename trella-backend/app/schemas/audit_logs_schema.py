"""audit_logs schema layer.

Pydantic request/response schemas for the ``audit_logs`` domain.

- ``AuditLogPublic``: API response shape. Extends ``CamelModel`` so fields
  serialize to camelCase (``orgId``, ``entityId``, ``entityType``,
  ``entityTitle``, ``userId``, ``userImage``, ``userName``, ``createdAt``,
  ``updatedAt``). Field set matches requirement 8.6 exactly.

See requirement 8.6 and design.md section "2. Serialization camelCase".
"""

import uuid
from datetime import datetime

from app.core.base import CamelModel


class AuditLogPublic(CamelModel):
    """API response for an audit log entry.

    Serializes to camelCase: ``orgId``, ``entityId``, ``entityType``,
    ``entityTitle``, ``userId``, ``userImage``, ``userName``, ``createdAt``,
    ``updatedAt`` (requirement 8.6).
    """

    id: uuid.UUID
    org_id: uuid.UUID
    action: str
    entity_id: uuid.UUID
    entity_type: str
    entity_title: str
    user_id: uuid.UUID
    user_image: str | None = None
    user_name: str
    created_at: datetime
    updated_at: datetime
