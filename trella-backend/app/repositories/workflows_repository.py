import uuid

from sqlmodel import Session, col, select

from app.models.workflows_model import Workflow, WorkflowTransition


class WorkflowsRepository:
    def create(self, session: Session, workflow: Workflow) -> Workflow:
        session.add(workflow)
        session.flush()
        return workflow

    def get(self, session: Session, workflow_id: uuid.UUID) -> Workflow | None:
        return session.get(Workflow, workflow_id)

    def list_by_workspace(
        self, session: Session, workspace_id: uuid.UUID
    ) -> list[Workflow]:
        statement = (
            select(Workflow)
            .where(Workflow.workspace_id == workspace_id)
            .order_by(col(Workflow.created_at))
        )
        return list(session.exec(statement).all())

    def update(self, session: Session, workflow: Workflow) -> Workflow:
        session.add(workflow)
        session.flush()
        return workflow

    def delete(self, session: Session, workflow: Workflow) -> None:
        session.delete(workflow)
        session.flush()


class WorkflowTransitionsRepository:
    def create(
        self, session: Session, transition: WorkflowTransition
    ) -> WorkflowTransition:
        session.add(transition)
        session.flush()
        return transition

    def get(
        self, session: Session, transition_id: uuid.UUID
    ) -> WorkflowTransition | None:
        return session.get(WorkflowTransition, transition_id)

    def list_by_workflow(
        self, session: Session, workflow_id: uuid.UUID
    ) -> list[WorkflowTransition]:
        statement = select(WorkflowTransition).where(
            WorkflowTransition.workflow_id == workflow_id
        )
        return list(session.exec(statement).all())

    def delete(self, session: Session, transition: WorkflowTransition) -> None:
        session.delete(transition)
        session.flush()
