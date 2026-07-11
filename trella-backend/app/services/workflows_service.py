import json
import uuid
from typing import Any
from fastapi import HTTPException, status
from sqlmodel import Session, select
from app.models.enums import WorkspaceMode
from app.models.workflows_model import Workflow, WorkflowTransition
from app.models.custom_statuses_model import CustomStatus
from app.models.projects_model import Project
from app.models.workspaces_model import Workspace
from app.models.users_model import User
from app.repositories.workflows_repository import WorkflowsRepository, WorkflowTransitionsRepository
from app.services.organization_members_service import OrganizationMemberService


class WorkflowsService:
    def __init__(
        self,
        workflows_repo: WorkflowsRepository | None = None,
        transitions_repo: WorkflowTransitionsRepository | None = None,
        member_service: OrganizationMemberService | None = None,
    ) -> None:
        self.workflows_repo = workflows_repo or WorkflowsRepository()
        self.transitions_repo = transitions_repo or WorkflowTransitionsRepository()
        self.member_service = member_service or OrganizationMemberService()

    def _assert_admin_or_owner(self, session: Session, workspace_id: uuid.UUID, user_id: uuid.UUID) -> None:
        member = self.member_service.assert_member(session, workspace_id, user_id)
        if member.role not in {"OWNER", "ADMIN"}:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only workspace owners or administrators can manage workflows",
            )

    def bootstrap_default_workflow(self, session: Session, workspace_id: uuid.UUID) -> Workflow:
        """Create a default 'Standard Software Development Workflow' template for a workspace."""
        # Check if active workflow already exists
        existing = session.exec(
            select(Workflow).where(
                Workflow.workspace_id == workspace_id,
                Workflow.is_active == True,
            )
        ).first()
        if existing:
            return existing

        # Create standard workflow metadata
        workflow = Workflow(
            workspace_id=workspace_id,
            name="Standard Software Development Workflow",
            description="Default workflow with Backlog, Selected for Development, In Progress, Code Review, and Done statuses.",
            is_active=True,
        )
        workflow = self.workflows_repo.create(session, workflow)

        # Get or create CustomStatus rows for this workspace.
        statuses = session.exec(
            select(CustomStatus).where(CustomStatus.workspace_id == workspace_id)
        ).all()

        status_map = {s.name.lower(): s for s in statuses}
        default_status_definitions = [
            ("Backlog", "#6b7280", "TODO"),
            ("Selected for Development", "#3b82f6", "TODO"),
            ("In Progress", "#3b82f6", "IN_PROGRESS"),
            ("Code Review", "#8b5cf6", "IN_PROGRESS"),
            ("Done", "#10b981", "DONE"),
        ]

        resolved_statuses = {}
        for name, color, canonical in default_status_definitions:
            key = name.lower()
            if key in status_map:
                resolved_statuses[name] = status_map[key]
            else:
                new_status = CustomStatus(
                    workspace_id=workspace_id,
                    name=name,
                    color=color,
                    canonical_status=canonical,
                )
                session.add(new_status)
                session.flush()
                resolved_statuses[name] = new_status

        # Create default transitions
        backlog = resolved_statuses["Backlog"]
        selected = resolved_statuses["Selected for Development"]
        in_progress = resolved_statuses["In Progress"]
        code_review = resolved_statuses["Code Review"]
        done = resolved_statuses["Done"]

        transitions = [
            WorkflowTransition(
                workflow_id=workflow.id,
                name="Move to Backlog",
                from_status_id=None,
                to_status_id=backlog.id,
            ),
            WorkflowTransition(
                workflow_id=workflow.id,
                name="Done",
                from_status_id=None,
                to_status_id=done.id,
                validators=json.dumps([{"type": "COMMENT_REQUIRED"}]),
            ),
            WorkflowTransition(
                workflow_id=workflow.id,
                name="Select for Dev",
                from_status_id=backlog.id,
                to_status_id=selected.id,
            ),
            WorkflowTransition(
                workflow_id=workflow.id,
                name="Start Progress",
                from_status_id=selected.id,
                to_status_id=in_progress.id,
                actions=json.dumps([{"type": "AUTO_ASSIGN_TO_ACTOR"}]),
            ),
            WorkflowTransition(
                workflow_id=workflow.id,
                name="Submit for Review",
                from_status_id=in_progress.id,
                to_status_id=code_review.id,
                conditions=json.dumps([{"type": "ASSIGNEE_ONLY"}]),
            ),
            WorkflowTransition(
                workflow_id=workflow.id,
                name="Reject Code Review",
                from_status_id=code_review.id,
                to_status_id=in_progress.id,
                validators=json.dumps([{"type": "COMMENT_REQUIRED"}]),
            ),
        ]

        for trans in transitions:
            self.transitions_repo.create(session, trans)

        # Set default project workflow
        projects = session.exec(
            select(Project).where(Project.workspace_id == workspace_id)
        ).all()
        for project in projects:
            if project.workflow_id is None:
                project.workflow_id = workflow.id
                session.add(project)

        session.commit()
        session.refresh(workflow)
        return workflow

    def create_workflow(self, session: Session, workspace_id: uuid.UUID, data: Any, user: User) -> Workflow:
        self._assert_admin_or_owner(session, workspace_id, user.id)
        workflow = Workflow(
            workspace_id=workspace_id,
            name=data.name,
            description=data.description,
            is_active=True,
        )
        wf = self.workflows_repo.create(session, workflow)
        session.commit()
        session.refresh(wf)
        return wf

    def list_workflows(self, session: Session, workspace_id: uuid.UUID, user: User) -> list[Workflow]:
        self.member_service.assert_member(session, workspace_id, user.id)
        return self.workflows_repo.list_by_workspace(session, workspace_id)

    def get_workflow(self, session: Session, workflow_id: uuid.UUID, user: User) -> Workflow:
        workflow = self.workflows_repo.get(session, workflow_id)
        if not workflow:
            raise HTTPException(status_code=404, detail="Workflow not found")
        self.member_service.assert_member(session, workflow.workspace_id, user.id)
        # Fetch associated transitions and bind dynamically
        transitions = self.transitions_repo.list_by_workflow(session, workflow_id)
        object.__setattr__(workflow, "transitions", transitions)
        return workflow

    def update_workflow(self, session: Session, workflow_id: uuid.UUID, data: Any, user: User) -> Workflow:
        workflow = self.workflows_repo.get(session, workflow_id)
        if not workflow:
            raise HTTPException(status_code=404, detail="Workflow not found")
        self._assert_admin_or_owner(session, workflow.workspace_id, user.id)
        
        updates = data.model_dump(exclude_unset=True)
        for field, value in updates.items():
            setattr(workflow, field, value)
            
        wf = self.workflows_repo.update(session, workflow)
        session.commit()
        session.refresh(wf)
        return wf

    def delete_workflow(self, session: Session, workflow_id: uuid.UUID, user: User) -> None:
        workflow = self.workflows_repo.get(session, workflow_id)
        if not workflow:
            raise HTTPException(status_code=404, detail="Workflow not found")
        self._assert_admin_or_owner(session, workflow.workspace_id, user.id)
        
        # Prevent deleting the active workflow if it's referenced by any projects
        projects_using_it = session.exec(select(Project).where(Project.workflow_id == workflow_id)).first()
        if projects_using_it:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Cannot delete a workflow that is currently in use by one or more projects.",
            )
            
        self.workflows_repo.delete(session, workflow)
        session.commit()

    def create_transition(self, session: Session, workflow_id: uuid.UUID, data: Any, user: User) -> WorkflowTransition:
        workflow = self.workflows_repo.get(session, workflow_id)
        if not workflow:
            raise HTTPException(status_code=404, detail="Workflow not found")
        self._assert_admin_or_owner(session, workflow.workspace_id, user.id)

        transition = WorkflowTransition(
            workflow_id=workflow_id,
            name=data.name,
            from_status_id=data.from_status_id,
            to_status_id=data.to_status_id,
            conditions=json.dumps(data.conditions),
            validators=json.dumps(data.validators),
            actions=json.dumps(data.actions),
        )
        trans = self.transitions_repo.create(session, transition)
        session.commit()
        session.refresh(trans)
        return trans

    def update_transition(self, session: Session, transition_id: uuid.UUID, data: Any, user: User) -> WorkflowTransition:
        transition = self.transitions_repo.get(session, transition_id)
        if not transition:
            raise HTTPException(status_code=404, detail="Workflow transition not found")
        workflow = self.workflows_repo.get(session, transition.workflow_id)
        assert workflow is not None
        self._assert_admin_or_owner(session, workflow.workspace_id, user.id)

        updates = data.model_dump(exclude_unset=True)
        if "name" in updates:
            transition.name = updates["name"]
        if "from_status_id" in updates:
            transition.from_status_id = updates["from_status_id"]
        if "to_status_id" in updates:
            transition.to_status_id = updates["to_status_id"]
        if "conditions" in updates:
            transition.conditions = json.dumps(updates["conditions"])
        if "validators" in updates:
            transition.validators = json.dumps(updates["validators"])
        if "actions" in updates:
            transition.actions = json.dumps(updates["actions"])

        session.add(transition)
        session.commit()
        session.refresh(transition)
        return transition

    def delete_transition(self, session: Session, transition_id: uuid.UUID, user: User) -> None:
        transition = self.transitions_repo.get(session, transition_id)
        if not transition:
            raise HTTPException(status_code=404, detail="Workflow transition not found")
        workflow = self.workflows_repo.get(session, transition.workflow_id)
        assert workflow is not None
        self._assert_admin_or_owner(session, workflow.workspace_id, user.id)

        self.transitions_repo.delete(session, transition)
        session.commit()

    def validate_and_process_transition(
        self,
        session: Session,
        workspace_id: uuid.UUID,
        project_id: uuid.UUID,
        task: Any,
        from_status_id: uuid.UUID | None,
        to_status_id: uuid.UUID,
        user: User,
        comment: str | None = None,
    ) -> None:
        """Validate the transition against the workflow rules.
        If valid, executes actions/side-effects. Otherwise, raises HTTPException.
        """
        workspace = session.get(Workspace, workspace_id)
        if not workspace or workspace.mode == WorkspaceMode.KANBAN.value:
            return

        project = session.get(Project, project_id)
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")

        workflow_id = project.workflow_id
        if not workflow_id:
            active_wf = session.exec(
                select(Workflow).where(
                    Workflow.workspace_id == workspace_id,
                    Workflow.is_active == True,
                )
            ).first()
            if not active_wf:
                active_wf = self.bootstrap_default_workflow(session, workspace_id)
            workflow_id = active_wf.id

        transition = session.exec(
            select(WorkflowTransition).where(
                WorkflowTransition.workflow_id == workflow_id,
                WorkflowTransition.from_status_id == from_status_id,
                WorkflowTransition.to_status_id == to_status_id,
            )
        ).first()

        if not transition:
            transition = session.exec(
                select(WorkflowTransition).where(
                    WorkflowTransition.workflow_id == workflow_id,
                    WorkflowTransition.from_status_id == None,
                    WorkflowTransition.to_status_id == to_status_id,
                )
            ).first()

        if not transition:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid workflow transition path",
            )

        conditions = json.loads(transition.conditions)
        validators = json.loads(transition.validators)
        actions = json.loads(transition.actions)

        for cond in conditions:
            cond_type = cond.get("type")
            if cond_type == "ASSIGNEE_ONLY":
                if task.assignee_id != user.id:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="Only the current assignee can transition this task",
                    )
            elif cond_type == "ROLE_CHECK":
                allowed_roles = cond.get("config", {}).get("roles", [])
                from app.repositories.project_members_repository import ProjectMembersRepository
                pm_repo = ProjectMembersRepository()
                member = pm_repo.get_active(session, project_id, user.id)
                role = member.project_role if member else None
                if not role or role not in allowed_roles:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail=f"Only users with roles {allowed_roles} can transition this task",
                    )

        for val in validators:
            val_type = val.get("type")
            if val_type == "COMMENT_REQUIRED":
                if not comment or not comment.strip():
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="A transition comment is required to perform this action",
                    )

        for act in actions:
            act_type = act.get("type")
            if act_type == "AUTO_ASSIGN_TO_ACTOR":
                task.assignee_id = user.id
            elif act_type == "CLEAR_FIELD":
                field = act.get("config", {}).get("field")
                if field and hasattr(task, field):
                    setattr(task, field, None)
