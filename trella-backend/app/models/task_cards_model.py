import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, Text, event
from sqlalchemy.orm import object_session
from sqlmodel import Field

from app.core.base import TimestampMixin, UUIDMixin


class Card(UUIDMixin, TimestampMixin, table=True):
    __tablename__ = "tasks"  # type: ignore
    __table_args__ = {"extend_existing": True}

    list_id: uuid.UUID = Field(
        sa_column=Column(
            "column_id",
            ForeignKey("board_columns.id", ondelete="CASCADE"),
            nullable=False,
        )
    )
    title: str = Field(max_length=255)
    description: str | None = Field(default=None, sa_type=Text)
    order: int = Field(sa_column=Column("position", Integer, nullable=False))
    board_id: uuid.UUID = Field(
        default=None, foreign_key="boards.id", ondelete="CASCADE", nullable=False
    )
    project_id: uuid.UUID = Field(
        default=None, foreign_key="projects.id", ondelete="CASCADE", nullable=False
    )
    priority: str = Field(default="MEDIUM", max_length=20)
    due_date: datetime | None = Field(
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


@event.listens_for(Card, "before_insert")
def resolve_card_project_and_board(_mapper, _connection, target: Card) -> None:
    session = object_session(target)
    if session is not None:
        from app.models.board_columns_model import BoardColumn
        from app.models.boards_model import Board

        column = session.get(BoardColumn, target.list_id)
        if column:
            if target.board_id is None:
                target.board_id = column.board_id
            board = session.get(Board, column.board_id)
            if board:
                if target.project_id is None:
                    target.project_id = board.project_id

                # Auto resolve custom status based on column's status_key
                if target.custom_status_id is None and column.status_key:
                    from sqlmodel import select

                    from app.models.custom_statuses_model import CustomStatus
                    from app.models.projects_model import Project

                    project = session.get(Project, board.project_id)
                    if project:
                        stmt = select(CustomStatus).where(
                            CustomStatus.workspace_id == project.workspace_id,
                            CustomStatus.canonical_status == column.status_key.upper(),
                        )
                        cs = session.exec(stmt).first()
                        if cs:
                            target.custom_status_id = cs.id


@event.listens_for(Card, "before_update")
def resolve_card_custom_status_on_update(_mapper, _connection, target: Card) -> None:
    session = object_session(target)
    if session is not None:
        from sqlalchemy.orm.attributes import get_history

        history = get_history(target, "list_id")
        if history.has_changes():
            from app.models.board_columns_model import BoardColumn
            from app.models.boards_model import Board

            column = session.get(BoardColumn, target.list_id)
            if column:
                target.board_id = column.board_id
                board = session.get(Board, column.board_id)
                if board:
                    target.project_id = board.project_id

                    if column.status_key:
                        from sqlmodel import select

                        from app.models.custom_statuses_model import CustomStatus
                        from app.models.projects_model import Project

                        project = session.get(Project, board.project_id)
                        if project:
                            stmt = select(CustomStatus).where(
                                CustomStatus.workspace_id == project.workspace_id,
                                CustomStatus.canonical_status
                                == column.status_key.upper(),
                            )
                            cs = session.exec(stmt).first()
                            if cs:
                                target.custom_status_id = cs.id
                            else:
                                target.custom_status_id = None
