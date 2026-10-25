from typing import Any

import psycopg
from psycopg.rows import dict_row

from app.config import settings


def connect() -> psycopg.Connection:
    # Open a connection to the database in DATABASE_URL, returning rows as dictionaries.
    if settings.database_url is None:
        raise RuntimeError("DATABASE_URL is not set. Add it to the .env file at the repo root.")
    return psycopg.connect(settings.database_url, row_factory=dict_row)


def fetch_all(sql: str, params: Any = None) -> list[dict[str, Any]]:
    # Run a SELECT and return every row.
    with connect() as conn:
        return conn.execute(sql, params).fetchall()


def fetch_one(sql: str, params: Any = None) -> dict[str, Any] | None:
    # Run a SELECT and return the first row, or None.
    with connect() as conn:
        return conn.execute(sql, params).fetchone()


def execute_many(sql: str, rows: list[dict[str, Any]]) -> None:
    # Run the same statement for many rows in one batch over one connection.
    with connect() as conn:
        conn.cursor().executemany(sql, rows)
