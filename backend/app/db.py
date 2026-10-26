from typing import Any

import psycopg
from psycopg.rows import dict_row

from app.config import settings


def connect() -> psycopg.Connection:
    """Open a connection to the database in DATABASE_URL that returns rows as dictionaries.

    Using the connection in a `with` block commits on success and rolls back on error, so
    statements run inside one block form a single transaction.
    """
    if settings.database_url is None:
        raise RuntimeError("DATABASE_URL is not set. Add it to the .env file at the repo root.")
    return psycopg.connect(settings.database_url, row_factory=dict_row)


def fetch_all(sql: str, params: Any = None) -> list[dict[str, Any]]:
    """Run a query and return every row."""
    with connect() as conn:
        return conn.execute(sql, params).fetchall()


def fetch_one(sql: str, params: Any = None) -> dict[str, Any] | None:
    """Run a query and return its first row, or None when there is none."""
    with connect() as conn:
        return conn.execute(sql, params).fetchone()


def execute_many(sql: str, rows: list[dict[str, Any]]) -> None:
    """Run one statement for many rows in a single batch over one connection."""
    with connect() as conn:
        conn.cursor().executemany(sql, rows)
