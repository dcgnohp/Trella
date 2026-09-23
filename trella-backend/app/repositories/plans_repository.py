import uuid

from sqlmodel import Session, col, select

from app.models.plans_model import Plan


class PlansRepository:
    def create(self, session: Session, plan: Plan) -> Plan:
        session.add(plan)
        session.flush()
        return plan

    def get(self, session: Session, plan_id: uuid.UUID) -> Plan | None:
        """Return the plan with the given id, or None if absent."""
        return session.get(Plan, plan_id)

    def list_by_workspace(
        self, session: Session, workspace_id: uuid.UUID
    ) -> list[Plan]:
        """Return all plans of a workspace, ordered by created_at ascending."""
        statement = (
            select(Plan)
            .where(Plan.workspace_id == workspace_id)
            .order_by(col(Plan.created_at))
        )
        return list(session.exec(statement).all())

    def update(self, session: Session, plan: Plan) -> Plan:
        session.add(plan)
        session.flush()
        return plan

    def delete(self, session: Session, plan: Plan) -> None:
        session.delete(plan)
        session.flush()
