import uuid
from datetime import datetime

from sqlalchemy import DateTime, Text, event
from sqlalchemy.orm import object_session
from sqlmodel import Field

from app.core.base import TimestampMixin, UUIDMixin

DEFAULT_TASK_PRIORITY = "MEDIUM"
DEFAULT_TASK_TYPE = "TASK"


class Task(UUIDMixin, TimestampMixin, table=True):
    __tablename__ = "tasks"  # type: ignore
    __table_args__ = {"extend_existing": True}

    project_id: uuid.UUID = Field(foreign_key="projects.id", ondelete="CASCADE")
    board_id: uuid.UUID = Field(foreign_key="boards.id", ondelete="CASCADE")
    column_id: uuid.UUID = Field(foreign_key="board_columns.id", ondelete="CASCADE")
    title: str = Field(max_length=500)
    description: str | None = Field(default=None, sa_type=Text)
    priority: str = Field(default=DEFAULT_TASK_PRIORITY, max_length=20)
    # pyrefly: ignore [no-matching-overload]
    due_date: datetime | None = Field(
        default=None,
        sa_type=DateTime(timezone=True),  # type: ignore[call-overload]
        nullable=True,
    )
    # pyrefly: ignore [no-matching-overload]
    start_date: datetime | None = Field(
        default=None,
        sa_type=DateTime(timezone=True),  # type: ignore[call-overload]
        nullable=True,
    )
    assignee_id: uuid.UUID | None = Field(
        default=None,
        foreign_key="users.id",
        ondelete="SET NULL",
        nullable=True,
    )
    custom_status_id: uuid.UUID | None = Field(
        default=None,
        foreign_key="custom_statuses.id",
        ondelete="SET NULL",
        nullable=True,
    )
    position: int = Field()
    # Jira-mode fields
    type: str = Field(default=DEFAULT_TASK_TYPE, max_length=20)
    story_point: int | None = Field(default=None, nullable=True)
    sprint_id: uuid.UUID | None = Field(
        default=None,
        foreign_key="sprints.id",
        ondelete="SET NULL",
        nullable=True,
    )
    epic_id: uuid.UUID | None = Field(
        default=None,
        foreign_key="tasks.id",
        ondelete="SET NULL",
        nullable=True,
    )
    parent_id: uuid.UUID | None = Field(
        default=None,
        foreign_key="tasks.id",
        ondelete="SET NULL",
        nullable=True,
    )
    issue_key: str | None = Field(default=None, max_length=50, nullable=True)


@event.listens_for(Task, "before_insert")
def resolve_task_custom_status_before_insert(
    _mapper, _connection, target: Task
) -> None:
    session = object_session(target)
    if session is not None:
        from app.models.board_columns_model import BoardColumn
        from app.models.boards_model import Board

        column = session.get(BoardColumn, target.column_id)
        if column:
            if target.board_id is None:
                target.board_id = column.board_id
            board = session.get(Board, column.board_id)
            if board:
                if target.project_id is None:
                    target.project_id = board.project_id

                # Auto resolve custom status based on column name or status_key
                if target.custom_status_id is None:
                    from sqlmodel import func, select

                    from app.models.custom_statuses_model import CustomStatus
                    from app.models.projects_model import Project

                    project = session.get(Project, board.project_id)
                    if project:
                        # 1. Match by name (case-insensitive)
                        stmt_name = select(CustomStatus).where(
                            CustomStatus.workspace_id == project.workspace_id,
                            func.lower(CustomStatus.name) == func.lower(column.name),
                        )
                        cs = session.exec(stmt_name).first()
                        if not cs and column.status_key:
                            # 2. Fallback to canonical status mapping
                            stmt_canonical = select(CustomStatus).where(
                                CustomStatus.workspace_id == project.workspace_id,
                                CustomStatus.canonical_status
                                == column.status_key.upper(),
                            )
                            cs = session.exec(stmt_canonical).first()
                        if cs:
                            target.custom_status_id = cs.id


@event.listens_for(Task, "before_update")
def resolve_task_custom_status_on_update(_mapper, _connection, target: Task) -> None:
    session = object_session(target)
    if session is not None:
        from sqlalchemy.orm.attributes import get_history

        history = get_history(target, "column_id")
        if history.has_changes():
            cs_history = get_history(target, "custom_status_id")
            if cs_history.has_changes():
                return

            from app.models.board_columns_model import BoardColumn
            from app.models.boards_model import Board

            column = session.get(BoardColumn, target.column_id)
            if column:
                target.board_id = column.board_id
                board = session.get(Board, column.board_id)
                if board:
                    target.project_id = board.project_id

                    from sqlmodel import func, select

                    from app.models.custom_statuses_model import CustomStatus
                    from app.models.projects_model import Project

                    if target.custom_status_id is not None:
                        current_cs = session.get(CustomStatus, target.custom_status_id)
                        if (
                            current_cs
                            and current_cs.name.lower() == column.name.lower()
                        ):
                            return

                    project = session.get(Project, board.project_id)
                    if project:
                        # 1. Match by name (case-insensitive)
                        stmt_name = select(CustomStatus).where(
                            CustomStatus.workspace_id == project.workspace_id,
                            func.lower(CustomStatus.name) == func.lower(column.name),
                        )
                        cs = session.exec(stmt_name).first()
                        if not cs and column.status_key:
                            # 2. Fallback to canonical status mapping
                            stmt_canonical = select(CustomStatus).where(
                                CustomStatus.workspace_id == project.workspace_id,
                                CustomStatus.canonical_status
                                == column.status_key.upper(),
                            )
                            cs = session.exec(stmt_canonical).first()
                        if cs:
                            target.custom_status_id = cs.id
                        else:
                            target.custom_status_id = None
