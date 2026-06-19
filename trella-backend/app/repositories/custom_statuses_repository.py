import importlib
import uuid

from sqlmodel import Session, col, func, select

from app.models.custom_statuses_model import CustomStatus


class CustomStatusesRepository:
    def create(self, session: Session, custom_status: CustomStatus) -> CustomStatus:
        session.add(custom_status)
        session.flush()
        return custom_status

    def get(self, session: Session, custom_status_id: uuid.UUID) -> CustomStatus | None:
        return session.get(CustomStatus, custom_status_id)

    def list_by_workspace(
        self, session: Session, workspace_id: uuid.UUID
    ) -> list[CustomStatus]:
        statement = (
            select(CustomStatus)
            .where(CustomStatus.workspace_id == workspace_id)
            .order_by(col(CustomStatus.created_at))
        )
        return list(session.exec(statement).all())

    def get_by_name(
        self, session: Session, workspace_id: uuid.UUID, name: str
    ) -> CustomStatus | None:
        statement = select(CustomStatus).where(
            CustomStatus.workspace_id == workspace_id,
            CustomStatus.name == name,
        )
        return session.exec(statement).first()

    def update(self, session: Session, custom_status: CustomStatus) -> CustomStatus:
        session.add(custom_status)
        session.flush()
        return custom_status

    def delete(self, session: Session, custom_status: CustomStatus) -> None:
        session.delete(custom_status)
        session.flush()

    def count_references(self, session: Session, custom_status_id: uuid.UUID) -> int:
        """Return how many entities still reference the given custom status."""
        task_count = self._count_task_references(session, custom_status_id)
        column_count = self._count_board_column_references(session, custom_status_id)
        return task_count + column_count

    def _count_task_references(
        self, session: Session, custom_status_id: uuid.UUID
    ) -> int:
        # Lazily import Task so this repository stays importable before the tasks
        # domain exists. Degrades to 0 when the model or table is unavailable.
        try:
            tasks_model = importlib.import_module("app.models.tasks_model")
            task = tasks_model.Task
        except (ImportError, AttributeError):
            return 0

        try:
            statement = (
                select(func.count())
                .select_from(task)
                .where(col(task.custom_status_id) == custom_status_id)
            )
            return session.exec(statement).one()
        except Exception:  # noqa: BLE001
            return 0

    def _count_board_column_references(
        self, session: Session, custom_status_id: uuid.UUID
    ) -> int:
        from app.models.board_columns_model import BoardColumn  # noqa: PLC0415

        candidate_keys = {str(custom_status_id)}
        custom_status = session.get(CustomStatus, custom_status_id)
        if custom_status is not None:
            candidate_keys.add(custom_status.name)

        statement = (
            select(func.count())
            .select_from(BoardColumn)
            .where(col(BoardColumn.status_key).in_(candidate_keys))
        )
        return session.exec(statement).one()
