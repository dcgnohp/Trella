from collections.abc import Generator

from sqlmodel import Session, create_engine

from app.core.config import settings
from app.core.security import hash_password
from app.models.users_model import User
from app.repositories.users_repository import UsersRepository

engine = create_engine(str(settings.SQLALCHEMY_DATABASE_URI))


# make sure all SQLModel models are imported (app.models) before initializing DB
# otherwise, SQLModel might fail to initialize relationships properly
# for more details: https://github.com/fastapi/full-stack-fastapi-template/issues/28


def get_db() -> Generator[Session, None, None]:
    with Session(engine) as session:
        yield session


def init_db(session: Session) -> None:
    repo = UsersRepository()
    user = repo.get_by_email(session, settings.FIRST_SUPERUSER)
    if not user:
        user = User(
            email=settings.FIRST_SUPERUSER,
            hashed_password=hash_password(settings.FIRST_SUPERUSER_PASSWORD),
            is_superuser=True,
        )
        repo.create(session, user)
        session.commit()
        session.refresh(user)
