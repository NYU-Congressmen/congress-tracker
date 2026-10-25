import sys
from pathlib import Path

from alembic.config import Config

from alembic import command
from app.config import settings

ALEMBIC_INI = Path(__file__).resolve().parents[1] / "alembic.ini"


def main() -> int:
    """Apply all pending migrations and return the process exit code."""
    # Allow the command to run before a teammate has configured the database.
    if settings.database_url is None:
        print("DATABASE_URL not set, skipping migrations")
        return 0
    command.upgrade(Config(str(ALEMBIC_INI)), "head")
    return 0


if __name__ == "__main__":
    sys.exit(main())
