import uuid

from fastapi import APIRouter

from app.core.deps import CurrentUser, SessionDep
from app.schemas.velocity_config_schema import VelocityConfigPublic, VelocityConfigUpdate
from app.services.velocity_config_service import VelocityConfigService

router = APIRouter(prefix="/workspaces/{workspace_id}/velocity-config", tags=["velocity-config"])

_service = VelocityConfigService()


@router.get("", response_model=VelocityConfigPublic)
def get_velocity_config(
    session: SessionDep,
    workspace_id: uuid.UUID,
    current_user: CurrentUser,
) -> VelocityConfigPublic:
    """Return the velocity config for a workspace. Creates a default (4 h/point) if none exists."""
    config = _service.get_or_create(session, workspace_id, current_user)
    return VelocityConfigPublic.model_validate(config)


@router.patch("", response_model=VelocityConfigPublic)
def update_velocity_config(
    session: SessionDep,
    workspace_id: uuid.UUID,
    data: VelocityConfigUpdate,
    current_user: CurrentUser,
) -> VelocityConfigPublic:
    """Update hours_per_point for a workspace's velocity config. Requires workspace ADMIN."""
    config = _service.update(session, workspace_id, data.hours_per_point, current_user)
    return VelocityConfigPublic.model_validate(config)
