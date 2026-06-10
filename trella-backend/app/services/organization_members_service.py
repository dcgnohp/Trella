"""organization_members service layer.

Service (business logic) for the ``organization_members`` domain.

Responsibilities:

- ``assert_member``: enforce org-scoping — a user must have a membership row for
  an organization to operate on its resources, else HTTP 403
  ``"Not a member of this organization"`` (requirements 4.1, 4.2, 4.4).
- ``add_owner``: bootstrap the org creator as an ``OWNER`` member when an
  Organization is created (requirement 3.2).

The service is the only layer that raises ``HTTPException`` for membership
checks; the repository stays free of HTTP concerns. Methods receive the
``Session`` from the caller and never commit — the caller (e.g. the
organizations service) owns the transaction so membership creation can be
composed atomically with org/limit/subscription bootstrapping.

See requirements 3.2, 4.1, 4.2, 4.4 and design.md sections
"4. Dependency Injection (deps)" and "8. OrgLimit & OrgSubscription".
"""

import uuid

from fastapi import HTTPException, status
from sqlmodel import Session

from app.models.organization_members_model import OrganizationMember
from app.repositories.organization_members_repository import (
    OrganizationMembersRepository,
)


class OrganizationMemberService:
    """Business logic for organization memberships (org-scoping + ownership)."""

    def __init__(
        self, repo: OrganizationMembersRepository | None = None
    ) -> None:
        self.repo = repo or OrganizationMembersRepository()

    def assert_member(
        self, session: Session, org_id: uuid.UUID, user_id: uuid.UUID
    ) -> OrganizationMember:
        """Return the membership for ``(user_id, org_id)`` or raise HTTP 403.

        Looks up the membership via the repository. When the user is not a
        member of the organization, raises ``HTTPException`` 403
        ``"Not a member of this organization"`` (Req 4.1, 4.2, 4.4). When found,
        returns the ``OrganizationMember`` so callers can inspect the role.
        """
        member = self.repo.get_by_user_and_org(session, user_id, org_id)
        if member is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not a member of this organization",
            )
        return member

    def add_owner(
        self, session: Session, org_id: uuid.UUID, user_id: uuid.UUID
    ) -> OrganizationMember:
        """Create an ``OWNER`` membership linking ``user_id`` to ``org_id``.

        Used when an Organization is created to bootstrap its creator as owner
        (Req 3.2). Stages the row via the repository (no commit) so the caller
        owns the transaction.
        """
        member = OrganizationMember(
            user_id=user_id, org_id=org_id, role="OWNER"
        )
        return self.repo.create(session, member)
