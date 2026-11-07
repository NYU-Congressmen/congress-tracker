import psycopg
import pytest

from app.config import settings
from app.db import MAX_CONNECTIONS, close_pools, connect, fetch_one


def test_many_queries_share_a_few_connections(db):
    pids = {fetch_one("SELECT pg_backend_pid() AS pid")["pid"] for _ in range(20)}

    assert len(pids) <= MAX_CONNECTIONS


def test_rows_come_back_as_dictionaries(db):
    assert fetch_one("SELECT 1 AS one") == {"one": 1}


def test_block_commits_on_success(db):
    with connect() as conn:
        conn.execute("INSERT INTO issues (name) VALUES ('Committed')")

    assert fetch_one("SELECT name FROM issues WHERE name = 'Committed'") is not None
    with connect() as conn:
        conn.execute("DELETE FROM issues WHERE name = 'Committed'")


def test_block_rolls_back_on_error(db):
    with pytest.raises(RuntimeError), connect() as conn:
        conn.execute("INSERT INTO issues (name) VALUES ('Rolled back')")
        raise RuntimeError("stop")

    assert fetch_one("SELECT name FROM issues WHERE name = 'Rolled back'") is None


def test_failed_statement_leaves_the_pool_usable(db):
    with pytest.raises(psycopg.Error), connect() as conn:
        conn.execute("SELECT * FROM no_such_table")

    assert fetch_one("SELECT 1 AS one") == {"one": 1}


def test_closed_pools_reopen_on_the_next_query(db):
    fetch_one("SELECT 1 AS one")
    close_pools()

    assert fetch_one("SELECT 1 AS one") == {"one": 1}


def test_missing_database_url_is_reported(monkeypatch):
    monkeypatch.setattr(settings, "database_url", None)

    with pytest.raises(RuntimeError, match="DATABASE_URL is not set"):
        connect()
