import sys

sys.path.insert(0, ".")

from sqlmodel import Session, select
from app.core.db import engine
from app.models.users_model import User
from app.core.security import hash_password
from app.repositories.users_repository import UsersRepository


def main():
    with Session(engine) as session:
        repo = UsersRepository()

        # 1. Update dev1@example.com password
        dev1 = repo.get_by_email(session, "dev1@example.com")
        if dev1:
            dev1.hashed_password = hash_password("changethis")
            session.add(dev1)
            print("dev1@example.com password updated successfully.")

        # 2. Create visitor@example.com (non-member)
        visitor = repo.get_by_email(session, "visitor@example.com")
        if not visitor:
            visitor = User(
                email="visitor@example.com",
                full_name="Visitor User",
                hashed_password=hash_password("changethis"),
                is_superuser=False,
                is_active=True,
            )
            repo.create(session, visitor)
            print("visitor@example.com created successfully.")
        else:
            visitor.hashed_password = hash_password("changethis")
            session.add(visitor)
            print("visitor@example.com updated successfully.")

        session.commit()


if __name__ == "__main__":
    main()
