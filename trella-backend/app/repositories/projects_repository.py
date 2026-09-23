import uuid

from sqlmodel import Session, col, select

from app.models.projects_model import Project


class ProjectsRepository:
    def create(self, session: Session, project: Project) -> Project:
        session.add(project)
        session.flush()
        return project

    def get(self, session: Session, project_id: uuid.UUID) -> Project | None:
        """Return the project with the given id, or None if absent."""
        return session.get(Project, project_id)

    def list_by_workspace(
        self, session: Session, workspace_id: uuid.UUID
    ) -> list[Project]:
        """Return all projects of a workspace, ordered by created_at ascending."""
        statement = (
            select(Project)
            .where(Project.workspace_id == workspace_id)
            .order_by(col(Project.created_at))
        )
        return list(session.exec(statement).all())

    def update(self, session: Session, project: Project) -> Project:
        session.add(project)
        session.flush()
        return project
