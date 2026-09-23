"""Widen alembic_version.version_num so it can hold this repo's longer revision ids.

Alembic hardcodes the version tracking column as VARCHAR(32). Several revision
ids in app/alembic/versions/ (e.g. "0008_board_members_and_comment_mentions",
39 chars) exceed that limit, which makes `alembic upgrade` fail with
"value too long for type character varying(32)" on a fresh database.

This widens the column to VARCHAR(255) before migrations run. It only touches
Alembic's own bookkeeping table, never application schema, and is idempotent
(safe to run on every deploy/start).
"""

import logging

from sqlalchemy import text

from app.core.db import engine

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def main() -> None:
    with engine.begin() as conn:
        conn.execute(
            text(
                "CREATE TABLE IF NOT EXISTS alembic_version ("
                "version_num VARCHAR(255) NOT NULL, "
                "CONSTRAINT alembic_version_pkc PRIMARY KEY (version_num))"
            )
        )
        conn.execute(text("ALTER TABLE alembic_version ALTER COLUMN version_num TYPE VARCHAR(255)"))
    logger.info("alembic_version.version_num widened to VARCHAR(255)")


if __name__ == "__main__":
    main()
