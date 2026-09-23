import uuid
from typing import Protocol, runtime_checkable

from sqlmodel import Session

from app.models.enums import MemberStatus, ProjectRole
from app.models.project_members_model import ProjectMember
from app.models.projects_model import Project
from app.models.users_model import User
from app.repositories.project_members_repository import ProjectMembersRepository
from app.repositories.projects_repository import ProjectsRepository


@runtime_checkable
class ProjectCreateData(Protocol):
    name: str
    key: str
    description: str | None


class ProjectsService:
    def __init__(
        self,
        projects_repo: ProjectsRepository | None = None,
        project_members_repo: ProjectMembersRepository | None = None,
    ) -> None:
        self.projects_repo = projects_repo or ProjectsRepository()
        self.project_members_repo = project_members_repo or ProjectMembersRepository()

    def create_project(
        self,
        session: Session,
        workspace_id: uuid.UUID,
        data: ProjectCreateData,
        user: User,
    ) -> Project:
        """Create a project and bootstrap the creator as PROJECT_ADMIN in one transaction."""
        try:
            project = self.projects_repo.create(
                session,
                Project(
                    workspace_id=workspace_id,
                    name=data.name,
                    key=data.key,
                    description=getattr(data, "description", None),
                    created_by=user.id,
                ),
            )
            self.project_members_repo.create(
                session,
                ProjectMember(
                    project_id=project.id,
                    user_id=user.id,
                    project_role=ProjectRole.PROJECT_ADMIN.value,
                    status=MemberStatus.ACTIVE.value,
                ),
            )
            session.commit()
        except Exception:
            session.rollback()
            raise
        session.refresh(project)
        return project
