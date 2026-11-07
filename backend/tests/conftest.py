import os

import psycopg
import pytest
from alembic.config import Config

from alembic import command
from app.config import settings
from app.migrate import ALEMBIC_INI

TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL", "postgresql:///congress_test")


@pytest.fixture(scope="session")
def migrated_database():
    """Rebuild a disposable test database from the migrations and point the app at it."""
    try:
        conn = psycopg.connect(TEST_DATABASE_URL, connect_timeout=3, autocommit=True)
    except psycopg.OperationalError as error:
        # CI sets this so a missing database fails loudly instead of skipping every test
        if os.environ.get("REQUIRE_TEST_DATABASE"):
            pytest.fail(f"The test database is required but unreachable: {error}")
        pytest.skip("No local PostgreSQL test database. SETUP.md explains how to add one.")
    with conn:
        # Rebuilding drops every table, so refuse anything that is not clearly a test database
        name = conn.execute("SELECT current_database()").fetchone()[0]
        if "test" not in name:
            pytest.fail(f"Refusing to rebuild {name!r}, because its name does not contain 'test'.")
        conn.execute("DROP SCHEMA public CASCADE")
        conn.execute("CREATE SCHEMA public")

    patch = pytest.MonkeyPatch()
    patch.setattr(settings, "database_url", TEST_DATABASE_URL)
    config = Config(str(ALEMBIC_INI))
    command.upgrade(config, "head")
    yield config
    patch.undo()


@pytest.fixture
def db(migrated_database, monkeypatch):
    """Empty every table before a test and return the Alembic config for the test database."""
    monkeypatch.setattr(settings, "database_url", TEST_DATABASE_URL)
    with psycopg.connect(TEST_DATABASE_URL) as conn:
        conn.execute("TRUNCATE bill_actions, bills, members, users RESTART IDENTITY CASCADE")
    return migrated_database
