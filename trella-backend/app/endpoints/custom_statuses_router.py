import uuid

from fastapi import APIRouter, Depends, status

from app.core.deps import CurrentUser, SessionDep, get_current_user
from app.schemas.custom_statuses_schema import (
    CustomStatusCreate,
    CustomStatusPublic,
    CustomStatusUpdate,
    MappingSummary,
    MappingUpdate,
)
from app.services.custom_statuses_service import CustomStatusesService

router = APIRouter(tags=["custom-statuses"])

_service = CustomStatusesService()


@router.post(
    "/workspaces/{workspace_id}/custom-statuses",
    response_model=CustomStatusPublic,
    status_code=status.HTTP_201_CREATED,
)
def create_custom_status(
    session: SessionDep,
    workspace_id: uuid.UUID,
    data: CustomStatusCreate,
    current_user: CurrentUser,
) -> CustomStatusPublic:
    custom_status = _service.create(session, workspace_id, data, current_user)
    return CustomStatusPublic.model_validate(custom_status)


@router.get(
    "/workspaces/{workspace_id}/custom-statuses",
    response_model=list[CustomStatusPublic],
)
def list_custom_statuses(
    session: SessionDep,
    workspace_id: uuid.UUID,
    current_user: CurrentUser,
) -> list[CustomStatusPublic]:
    statuses = _service.list(session, workspace_id, current_user)
    return [CustomStatusPublic.model_validate(cs) for cs in statuses]


@router.get(
    "/workspaces/{workspace_id}/custom-statuses/mapping-summary",
    response_model=MappingSummary,
)
def get_mapping_summary(
    session: SessionDep,
    workspace_id: uuid.UUID,
    current_user: CurrentUser,
) -> MappingSummary:
    # Declared before any catch-all so the literal "mapping-summary" segment is not captured as a parameter.
    summary = _service.mapping_summary(session, workspace_id, current_user)
    return MappingSummary.model_validate(summary)


@router.get(
    "/custom-statuses/{custom_status_id}",
    response_model=CustomStatusPublic,
    dependencies=[Depends(get_current_user)],
)
def get_custom_status(
    session: SessionDep,
    custom_status_id: uuid.UUID,
) -> CustomStatusPublic:
    """Fetch a single custom status by id, HTTP 404 when absent."""
    custom_status = _service.get(session, custom_status_id)
    return CustomStatusPublic.model_validate(custom_status)


@router.patch(
    "/custom-statuses/{custom_status_id}",
    response_model=CustomStatusPublic,
)
def update_custom_status(
    session: SessionDep,
    custom_status_id: uuid.UUID,
    data: CustomStatusUpdate,
    current_user: CurrentUser,
) -> CustomStatusPublic:
    custom_status = _service.update(session, custom_status_id, data, current_user)
    return CustomStatusPublic.model_validate(custom_status)


@router.delete(
    "/custom-statuses/{custom_status_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_custom_status(
    session: SessionDep,
    custom_status_id: uuid.UUID,
    current_user: CurrentUser,
) -> None:
    """Raise HTTP 409 if the status is still referenced by a Task or BoardColumn."""
    _service.delete(session, custom_status_id, current_user)


@router.put(
    "/custom-statuses/{custom_status_id}/mapping",
    response_model=CustomStatusPublic,
)
def set_custom_status_mapping(
    session: SessionDep,
    custom_status_id: uuid.UUID,
    data: MappingUpdate,
    current_user: CurrentUser,
) -> CustomStatusPublic:
    custom_status = _service.set_mapping(
        session, custom_status_id, data.canonical_status, current_user
    )
    return CustomStatusPublic.model_validate(custom_status)
