"""organizations service layer.

Service (business logic) for the ``organizations`` domain.

Responsibilities:

- ``create_org``: create an ``Organization`` and bootstrap its companion rows —
  an ``OWNER`` ``OrganizationMember`` for the creator, an ``OrgLimit`` with
  ``count = 0`` and an empty ``OrgSubscription`` — all inside ONE transaction
  (all-or-nothing). Organizations are NEVER auto-created at signup; they are
  created only through this explicit flow (Req 3.1, 3.2, 3.6).
- ``list_for_user``: resolve the organizations a user belongs to via their
  membership rows (Req 3.3).
- ``get_for_member``: fetch a single organization, enforcing org-scoping — a
  non-member gets HTTP 403, a missing org gets HTTP 404 (Req 3.4, 3.5).

The service owns the transaction: repositories receive the ``Session`` and only
stage/flush (never commit) so the create flow can commit atomically. When data
domains from other services are needed (membership), the service delegates to
``OrganizationMemberService`` rather than querying the DB directly.

See requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6 and design.md sections
"Components and Interfaces" + "8. OrgLimit & OrgSubscription".
"""

import uuid

from fastapi import HTTPException, status
from sqlmodel import Session

from app.models.org_limits_model import OrgLimit
from app.models.org_subscriptions_model import OrgSubscription
from app.models.organizations_model import Organization
from app.models.users_model import User
from app.repositories.org_limits_repository import OrgLimitsRepository
from app.repositories.org_subscriptions_repository import OrgSubscriptionsRepository
from app.repositories.organizations_repository import OrganizationsRepository
from app.schemas.organizations_schema import OrganizationCreate
from app.services.organization_members_service import OrganizationMemberService


class OrganizationsService:
    """Business logic for the ``organizations`` domain."""

    def __init__(
        self,
        organizations_repo: OrganizationsRepository | None = None,
        member_service: OrganizationMemberService | None = None,
        org_limits_repo: OrgLimitsRepository | None = None,
        org_subscriptions_repo: OrgSubscriptionsRepository | None = None,
    ) -> None:
        self.organizations_repo = organizations_repo or OrganizationsRepository()
        self.member_service = member_service or OrganizationMemberService()
        self.org_limits_repo = org_limits_repo or OrgLimitsRepository()
        self.org_subscriptions_repo = (
            org_subscriptions_repo or OrgSubscriptionsRepository()
        )

    def create_org(
        self, session: Session, data: OrganizationCreate, user: User
    ) -> Organization:
        """Create an organization and bootstrap its companion rows atomically.

        Within a single transaction this creates the ``Organization``, an
        ``OWNER`` ``OrganizationMember`` for ``user``, an ``OrgLimit`` with
        ``count = 0`` and an empty ``OrgSubscription``. Commits once at the end
        so the whole bootstrap is all-or-nothing; on any error the transaction
        is rolled back and the error re-raised (Req 3.2, 3.6).
        """
        try:
            org = self.organizations_repo.create(
                session, Organization(name=data.name)
            )
            self.member_service.add_owner(session, org.id, user.id)
            self.org_limits_repo.create(session, OrgLimit(org_id=org.id, count=0))
            self.org_subscriptions_repo.create(
                session, OrgSubscription(org_id=org.id)
            )
            session.commit()
        except Exception:
            session.rollback()
            raise
        session.refresh(org)
        return org

    def list_for_user(
        self, session: Session, user_id: uuid.UUID
    ) -> list[Organization]:
        """Return every organization the given user is a member of (Req 3.3).

        Resolves the user's membership rows, collects their ``org_id`` values and
        fetches the matching organizations. Returns an empty list when the user
        has no memberships.
        """
        memberships = self.member_service.repo.list_by_user(session, user_id)
        org_ids = [m.org_id for m in memberships]
        return self.organizations_repo.list_by_ids(session, org_ids)

    def get_for_member(
        self, session: Session, org_id: uuid.UUID, user_id: uuid.UUID
    ) -> Organization:
        """Return a single organization, enforcing org-scoping.

        Asserts the user is a member first — a non-member gets HTTP 403
        ``"Not a member of this organization"`` (Req 3.4). Then fetches the org;
        a missing org yields HTTP 404 ``"Organization not found"`` (Req 3.5).
        """
        self.member_service.assert_member(session, org_id, user_id)
        org = self.organizations_repo.get(session, org_id)
        if org is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Organization not found",
            )
        return org
