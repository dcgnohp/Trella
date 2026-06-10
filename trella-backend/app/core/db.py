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
    """Yield a SQLModel Session scoped to a single request/transaction.

    Each request gets its own Session via FastAPI's dependency system; the
    Session is closed automatically when the request finishes. Modules import
    this dependency with ``from app.core.db import get_db``.
    """
    with Session(engine) as session:
        yield session


def init_db(session: Session) -> None:
    """Ensure the FIRST_SUPERUSER account exists.

    Tables should be created with Alembic migrations. This bootstraps the
    initial superuser via the NEW layer-first code (``UsersRepository`` +
    ``app.core.security.hash_password``) instead of the deleted template
    ``app.crud``. Idempotent: only creates the user when missing.
    """
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
