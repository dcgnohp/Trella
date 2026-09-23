import uuid

from fastapi import APIRouter, status

from app.core.deps import CurrentUser, SessionDep
from app.schemas.workflows_schema import (
    WorkflowCreate,
    WorkflowPublic,
    WorkflowTransitionCreate,
    WorkflowTransitionPublic,
    WorkflowTransitionUpdate,
    WorkflowUpdate,
)
from app.services.workflows_service import WorkflowsService

router = APIRouter(tags=["workflows"])

_service = WorkflowsService()


@router.post(
    "/workspaces/{workspace_id}/workflows",
    response_model=WorkflowPublic,
    status_code=status.HTTP_201_CREATED,
)
def create_workflow(
    session: SessionDep,
    workspace_id: uuid.UUID,
    data: WorkflowCreate,
    current_user: CurrentUser,
) -> WorkflowPublic:
    wf = _service.create_workflow(session, workspace_id, data, current_user)
    return WorkflowPublic.model_validate(wf)


@router.get(
    "/workspaces/{workspace_id}/workflows",
    response_model=list[WorkflowPublic],
)
def list_workflows(
    session: SessionDep,
    workspace_id: uuid.UUID,
    current_user: CurrentUser,
) -> list[WorkflowPublic]:
    workflows = _service.list_workflows(session, workspace_id, current_user)
    return [WorkflowPublic.model_validate(wf) for wf in workflows]


@router.post(
    "/workspaces/{workspace_id}/workflows/bootstrap",
    response_model=WorkflowPublic,
)
def bootstrap_default_workflow(
    session: SessionDep,
    workspace_id: uuid.UUID,
    current_user: CurrentUser,
) -> WorkflowPublic:
    """Bootstrap a default standard workflow template if none exists."""
    # Ensure active member
    from app.services.organization_members_service import OrganizationMemberService

    member_service = OrganizationMemberService()
    member_service.assert_member(session, workspace_id, current_user.id)

    wf = _service.bootstrap_default_workflow(session, workspace_id)
    return WorkflowPublic.model_validate(wf)


@router.get(
    "/workflows/{workflow_id}",
    response_model=WorkflowPublic,
)
def get_workflow(
    session: SessionDep,
    workflow_id: uuid.UUID,
    current_user: CurrentUser,
) -> WorkflowPublic:
    wf = _service.get_workflow(session, workflow_id, current_user)
    return WorkflowPublic.model_validate(wf)


@router.patch(
    "/workflows/{workflow_id}",
    response_model=WorkflowPublic,
)
def update_workflow(
    session: SessionDep,
    workflow_id: uuid.UUID,
    data: WorkflowUpdate,
    current_user: CurrentUser,
) -> WorkflowPublic:
    wf = _service.update_workflow(session, workflow_id, data, current_user)
    return WorkflowPublic.model_validate(wf)


@router.delete(
    "/workflows/{workflow_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_workflow(
    session: SessionDep,
    workflow_id: uuid.UUID,
    current_user: CurrentUser,
) -> None:
    _service.delete_workflow(session, workflow_id, current_user)


@router.post(
    "/workflows/{workflow_id}/transitions",
    response_model=WorkflowTransitionPublic,
    status_code=status.HTTP_201_CREATED,
)
def create_transition(
    session: SessionDep,
    workflow_id: uuid.UUID,
    data: WorkflowTransitionCreate,
    current_user: CurrentUser,
) -> WorkflowTransitionPublic:
    trans = _service.create_transition(session, workflow_id, data, current_user)
    return WorkflowTransitionPublic.model_validate(trans)


@router.patch(
    "/workflows/transitions/{transition_id}",
    response_model=WorkflowTransitionPublic,
)
def update_transition(
    session: SessionDep,
    transition_id: uuid.UUID,
    data: WorkflowTransitionUpdate,
    current_user: CurrentUser,
) -> WorkflowTransitionPublic:
    trans = _service.update_transition(session, transition_id, data, current_user)
    return WorkflowTransitionPublic.model_validate(trans)


@router.delete(
    "/workflows/transitions/{transition_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_transition(
    session: SessionDep,
    transition_id: uuid.UUID,
    current_user: CurrentUser,
) -> None:
    _service.delete_transition(session, transition_id, current_user)
