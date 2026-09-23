import uuid

from sqlmodel import Session, col, select

from app.models.enums import SprintStatus
from app.models.sprints_model import Sprint


class SprintsRepository:
    def create(self, session: Session, sprint: Sprint) -> Sprint:
        session.add(sprint)
        session.flush()
        return sprint

    def get_by_id(self, session: Session, sprint_id: uuid.UUID) -> Sprint | None:
        return session.get(Sprint, sprint_id)

    def get_by_project(self, session: Session, project_id: uuid.UUID) -> list[Sprint]:
        statement = (
            select(Sprint)
            .where(Sprint.project_id == project_id)
            .order_by(col(Sprint.created_at))
        )
        return list(session.exec(statement).all())

    def get_active_sprint(
        self, session: Session, project_id: uuid.UUID
    ) -> Sprint | None:
        """Return the single ACTIVE sprint for a project, or None."""
        statement = select(Sprint).where(
            Sprint.project_id == project_id,
            Sprint.status == SprintStatus.ACTIVE.value,
        )
        return session.exec(statement).first()

    def update(self, session: Session, sprint: Sprint) -> Sprint:
        session.add(sprint)
        session.flush()
        return sprint

    def delete(self, session: Session, sprint: Sprint) -> None:
        session.delete(sprint)
        session.flush()
