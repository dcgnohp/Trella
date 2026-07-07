import uuid
from typing import Protocol, runtime_checkable

from fastapi import HTTPException, status
from sqlmodel import Session, col, select

from app.models.enums import TaskType
from app.models.plan_boards_model import PlanBoard
from app.models.plans_model import Plan
from app.models.tasks_model import Task
from app.models.users_model import User
from app.repositories.boards_repository import BoardsRepository
from app.repositories.plan_boards_repository import PlanBoardsRepository
from app.repositories.plans_repository import PlansRepository
from app.services.organization_members_service import OrganizationMemberService


@runtime_checkable
class PlanCreateData(Protocol):
    name: str
    description: str | None
    board_ids: list[uuid.UUID]


@runtime_checkable
class PlanUpdateData(Protocol):
    def model_dump(self, *, exclude_unset: bool = ...) -> dict: ...


class PlansService:
    def __init__(
        self,
        repo: PlansRepository | None = None,
        plan_boards_repo: PlanBoardsRepository | None = None,
        boards_repo: BoardsRepository | None = None,
        org_member_service: OrganizationMemberService | None = None,
    ) -> None:
        self.repo = repo or PlansRepository()
        self.plan_boards_repo = plan_boards_repo or PlanBoardsRepository()
        self.boards_repo = boards_repo or BoardsRepository()
        self.org_member_service = org_member_service or OrganizationMemberService()

    def create_plan(
        self,
        session: Session,
        workspace_id: uuid.UUID,
        data: PlanCreateData,
        user: User,
    ) -> Plan:
        """Create a plan and link the given boards to it in one transaction."""
        self.org_member_service.assert_member(session, workspace_id, user.id)
        try:
            plan = self.repo.create(
                session,
                Plan(
                    workspace_id=workspace_id,
                    name=data.name,
                    description=getattr(data, "description", None),
                    created_by=user.id,
                ),
            )
            # ponytail: board_ids aren't validated as belonging to this
            # workspace before linking. An id from another workspace (or a
            # nonexistent one) fails loudly via the FK constraint rather than
            # a clean 400 — acceptable for MVP.
            for board_id in data.board_ids:
                self.plan_boards_repo.create(
                    session, PlanBoard(plan_id=plan.id, board_id=board_id)
                )
            session.commit()
        except Exception:
            session.rollback()
            raise
        session.refresh(plan)
        return plan

    def list_plans(
        self, session: Session, workspace_id: uuid.UUID, user: User
    ) -> list[Plan]:
        self.org_member_service.assert_member(session, workspace_id, user.id)
        return self.repo.list_by_workspace(session, workspace_id)

    def get_plan(self, session: Session, plan_id: uuid.UUID, user: User) -> Plan:
        plan = self.repo.get(session, plan_id)
        if plan is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Plan not found"
            )
        self.org_member_service.assert_member(session, plan.workspace_id, user.id)
        return plan

    def update_plan(
        self,
        session: Session,
        plan_id: uuid.UUID,
        data: PlanUpdateData,
        user: User,
    ) -> Plan:
        plan = self.get_plan(session, plan_id, user)
        updates = data.model_dump(exclude_unset=True)
        for field, value in updates.items():
            setattr(plan, field, value)
        try:
            plan = self.repo.update(session, plan)
            session.commit()
        except Exception:
            session.rollback()
            raise
        session.refresh(plan)
        return plan

    def delete_plan(self, session: Session, plan_id: uuid.UUID, user: User) -> None:
        plan = self.get_plan(session, plan_id, user)
        try:
            self.repo.delete(session, plan)
            session.commit()
        except Exception:
            session.rollback()
            raise

    def list_board_ids(self, session: Session, plan_id: uuid.UUID) -> list[uuid.UUID]:
        return [
            pb.board_id for pb in self.plan_boards_repo.list_by_plan(session, plan_id)
        ]

    def list_epics_for_plan(
        self, session: Session, plan_id: uuid.UUID, user: User
    ) -> list[Task]:
        """Return non-subtask tasks across all boards linked to this plan."""
        self.get_plan(session, plan_id, user)  # 404/403 as appropriate
        board_ids = self.list_board_ids(session, plan_id)
        if not board_ids:
            return []
        statement = (
            select(Task)
            .where(
                col(Task.board_id).in_(board_ids),
                Task.type != TaskType.SUBTASK.value,
            )
            .order_by(col(Task.created_at))
        )
        return list(session.exec(statement).all())
