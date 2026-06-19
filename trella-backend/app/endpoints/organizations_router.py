import uuid

from fastapi import APIRouter, status

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
    """Create an organization owned by the authenticated user."""
    org = _service.create_org(session, data, current_user)
    return OrganizationPublic.model_validate(org)


@router.get("", response_model=list[OrganizationPublic])
def list_organizations(
    session: SessionDep,
    current_user: CurrentUser,
) -> list[OrganizationPublic]:
    """List the organizations the authenticated user is a member of."""
    orgs = _service.list_for_user(session, current_user.id)
    return [OrganizationPublic.model_validate(org) for org in orgs]


@router.get("/{org_id}", response_model=OrganizationPublic)
def get_organization(
    session: SessionDep,
    org_id: uuid.UUID,
    current_user: CurrentUser,
) -> OrganizationPublic:
    """Return organization detail. Raises HTTP 403 if not a member, HTTP 404 if org does not exist."""
    org = _service.get_for_member(session, org_id, current_user.id)
    return OrganizationPublic.model_validate(org)


@router.delete("/{org_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_organization(
    session: SessionDep,
    org_id: uuid.UUID,
    current_user: CurrentUser,
) -> None:
    """Delete an organization; raises HTTP 403 if user is not the owner, HTTP 404 if org does not exist."""
    _service.delete_org(session, org_id, current_user)
