"""Check the database revision and the schema objects needed by the release."""

import os
import re
import sys

import psycopg

MISSING_OBJECTS = """
    SELECT name FROM (
        SELECT 'public.' || name AS name, to_regclass('public.' || name) IS NOT NULL AS present
        FROM unnest(ARRAY[
            'bill_embeddings', 'issue_embeddings', 'bill_embedding_inputs', 'issue_embedding_inputs',
            'feed_embedding_distances'
        ]) AS relations(name)
        UNION ALL
        SELECT 'public.' || expected.table_name || '.' || expected.column_name, EXISTS (
            SELECT 1 FROM information_schema.columns AS col
            WHERE col.table_schema = 'public'
              AND col.table_name = expected.table_name
              AND col.column_name = expected.column_name
              AND col.data_type = expected.data_type
              AND col.is_nullable = 'YES'
        )
        FROM (
            VALUES ('actions', 'request_id', 'uuid'), ('actions', 'call_note', 'text'),
                   ('ai_calls', 'bill_id', 'text')
        ) AS expected(table_name, column_name, data_type)
        UNION ALL
        SELECT 'public.actions retry constraint', EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conrelid = to_regclass('public.actions') AND contype = 'u'
              AND pg_get_constraintdef(oid) IN (
                  'UNIQUE (uid, request_id)', 'UNIQUE (request_id, uid)'
              )
        )
    ) AS checks
    WHERE NOT present
    ORDER BY name
"""


def main() -> int:
    """Return success when Supabase matches the expected revision and has the required objects."""
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
            actual = sorted(version for (version,) in rows)
            if actual != [expected]:
                print(
                    f"Supabase schema mismatch. Expected {expected}, found "
                    f"{', '.join(actual) or 'none'}.",
                    file=sys.stderr,
                )
                return 1
            missing = [name for (name,) in conn.execute(MISSING_OBJECTS).fetchall()]
    except psycopg.Error as error:
        print(f"Could not read the Supabase schema ({type(error).__name__}).", file=sys.stderr)
        return 1

    if missing:
        print(
            f"Supabase is at {expected} and has missing or incompatible schema objects: "
            f"{', '.join(missing)}.",
            file=sys.stderr,
        )
        return 1
    print(f"Supabase schema matches {expected}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
