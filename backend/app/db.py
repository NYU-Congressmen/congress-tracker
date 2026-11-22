import atexit
from contextlib import AbstractContextManager
from threading import Lock
from typing import Any

import psycopg
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

from app.config import settings

# Supabase's session pooler allows few clients per project, and teammates share it
MAX_CONNECTIONS = 5
POOL_TIMEOUT = 10.0

# Opening a Supabase connection takes far longer than a typical query, so connections are reused.
# Pools are kept per address because the tests point the app at their own database.
_pools: dict[str, ConnectionPool] = {}
_pools_lock = Lock()


def _pool(url: str) -> ConnectionPool:
    """Return the connection pool for a database address, opening it on first use."""
    with _pools_lock:
        if url not in _pools:
            _pools[url] = ConnectionPool(
                url,
                min_size=1,
                max_size=MAX_CONNECTIONS,
                timeout=POOL_TIMEOUT,
                kwargs={"row_factory": dict_row},
                # Replaces a connection the server closed while it sat idle
                check=ConnectionPool.check_connection,
                open=True,
            )
        return _pools[url]


def close_pools() -> None:
    """Close every open connection pool."""
    with _pools_lock:
        for pool in _pools.values():
            pool.close()
        _pools.clear()


atexit.register(close_pools)


def connect() -> AbstractContextManager[psycopg.Connection]:
    """Return a pooled connection to DATABASE_URL that returns rows as dictionaries.

    Using the connection in a `with` block commits on success and rolls back on error, so
    statements run inside one block form a single transaction.
    """
    if settings.database_url is None:
        raise RuntimeError("DATABASE_URL is not set. Add it to the .env file at the repo root.")
    return _pool(settings.database_url).connection()


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
