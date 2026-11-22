"""Check the current database revision without applying migrations."""

import os
import re
import sys

import psycopg


def main() -> int:
    """Return success when Supabase is at the expected Alembic revision."""
    if len(sys.argv) != 2 or not re.fullmatch(r"[A-Za-z0-9_-]+", sys.argv[1]):
        print("Pass one expected Alembic revision.", file=sys.stderr)
        return 1
    expected = sys.argv[1]
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        print("DATABASE_URL is unavailable to the schema check.", file=sys.stderr)
        return 1

    try:
        with psycopg.connect(database_url, connect_timeout=8) as conn:
            conn.execute("SET TRANSACTION READ ONLY")
            conn.execute("SET LOCAL statement_timeout = '8s'")
            rows = conn.execute("SELECT version_num FROM public.alembic_version").fetchall()
    except psycopg.Error as error:
        print(f"Could not read the Supabase schema ({type(error).__name__}).", file=sys.stderr)
        return 1

    actual = sorted(version for (version,) in rows)
    if actual != [expected]:
        print(
            f"Supabase schema mismatch. Expected {expected}, found {', '.join(actual) or 'none'}.",
            file=sys.stderr,
        )
        return 1
    print(f"Supabase schema matches {expected}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
