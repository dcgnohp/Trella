import uuid

from sqlmodel import Session, select

from app.models.velocity_config_model import VelocityConfig

DEFAULT_HOURS_PER_POINT = 4.0


class VelocityConfigRepository:
    def get_by_workspace(
        self, session: Session, workspace_id: uuid.UUID
    ) -> VelocityConfig | None:
        statement = select(VelocityConfig).where(
            VelocityConfig.workspace_id == workspace_id
        )
        return session.exec(statement).first()

    def create(self, session: Session, config: VelocityConfig) -> VelocityConfig:
        session.add(config)
        session.flush()
        return config

    def update(self, session: Session, config: VelocityConfig) -> VelocityConfig:
        session.add(config)
        session.flush()
        return config

    def get_or_create_default(
        self, session: Session, workspace_id: uuid.UUID
    ) -> VelocityConfig:
        """Return the existing config or create a default one (not yet committed)."""
        config = self.get_by_workspace(session, workspace_id)
        if config is None:
            config = VelocityConfig(
                workspace_id=workspace_id,
                hours_per_point=DEFAULT_HOURS_PER_POINT,
            )
            config = self.create(session, config)
        return config
