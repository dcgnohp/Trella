import uuid

from sqlmodel import Session, select

from app.models.plan_boards_model import PlanBoard


class PlanBoardsRepository:
    def create(self, session: Session, plan_board: PlanBoard) -> PlanBoard:
        session.add(plan_board)
        session.flush()
        return plan_board

    def list_by_plan(self, session: Session, plan_id: uuid.UUID) -> list[PlanBoard]:
        statement = select(PlanBoard).where(PlanBoard.plan_id == plan_id)
        return list(session.exec(statement).all())

    def delete_by_plan(self, session: Session, plan_id: uuid.UUID) -> None:
        """Delete all PlanBoard rows for a plan.

        ponytail: kept for symmetry with other repos' delete methods; not
        exercised by the current MVP endpoints (no board-replacement on
        update yet), but a one-liner is cheap to keep around for when it is.
        """
        for plan_board in self.list_by_plan(session, plan_id):
            session.delete(plan_board)
        session.flush()
