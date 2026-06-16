"""organizations router layer.

FastAPI ``APIRouter`` for the ``organizations`` domain.

Exposes the organization create/list/detail endpoints under the
``/organizations`` prefix (the global ``/api/v1`` prefix is added later at
``app/api/main.py`` by task 16.1):

- ``POST /organizations`` (full path ``/api/v1/organizations``): create an
  organization for the authenticated user. Delegates to
  ``OrganizationsService.create_org`` which also bootstraps the owning
  ``OrganizationMember`` (role ``OWNER``), ``OrgLimit`` and ``OrgSubscription``
  rows. Returns the created organization as ``OrganizationPublic`` (camelCase).
- ``GET /organizations`` (full path ``/api/v1/organizations``): list the
  organizations the current user is a member of via
  ``OrganizationsService.list_for_user``.
- ``GET /organizations/{org_id}`` (full path
  ``/api/v1/organizations/{org_id}``): return organization detail when the
  current user is a member, else HTTP 403 "Not a member of this organization",
  or HTTP 404 when the org does not exist. Delegates to
  ``OrganizationsService.get_for_member``.

All endpoints require an authenticated user resolved by the ``get_current_user``
dependency (``CurrentUser``). See requirements 3.2, 3.3, 3.4, 3.5 and design.md
sections "Components and Interfaces" + "Dependency Injection (deps)".
"""

import uuid

from fastapi import APIRouter

from app.core.deps import CurrentUser, SessionDep
from app.schemas.organizations_schema import OrganizationCreate, OrganizationPublic
from app.services.organizations_service import OrganizationsService

router = APIRouter(prefix="/organizations", tags=["organizations"])

_service = OrganizationsService()


@router.post("", response_model=OrganizationPublic)
def create_organization(
    session: SessionDep,
    data: OrganizationCreate,
    current_user: CurrentUser,
) -> OrganizationPublic:
    """Create an organization owned by the authenticated user.

    Delegates to ``OrganizationsService.create_org`` which atomically creates the
    organization plus its owning ``OrganizationMember`` (role ``OWNER``),
    ``OrgLimit`` (``count`` = 0) and ``OrgSubscription`` rows (Req 3.2, 3.6).
    Returns the created organization as ``OrganizationPublic`` (camelCase).
    """
    org = _service.create_org(session, data, current_user)
    return OrganizationPublic.model_validate(org)


@router.get("", response_model=list[OrganizationPublic])
def list_organizations(
    session: SessionDep,
    current_user: CurrentUser,
) -> list[OrganizationPublic]:
    """List the organizations the authenticated user is a member of (Req 3.3)."""
    orgs = _service.list_for_user(session, current_user.id)
    return [OrganizationPublic.model_validate(org) for org in orgs]


@router.get("/{org_id}", response_model=OrganizationPublic)
def get_organization(
    session: SessionDep,
    org_id: uuid.UUID,
    current_user: CurrentUser,
) -> OrganizationPublic:
    """Return an organization detail, enforcing org-scoping.

    Returns the organization when the current user is a member; raises HTTP 403
    "Not a member of this organization" when they are not (Req 3.4) and HTTP 404
    when ``org_id`` does not exist (Req 3.5).
    """
    org = _service.get_for_member(session, org_id, current_user.id)
    return OrganizationPublic.model_validate(org)
