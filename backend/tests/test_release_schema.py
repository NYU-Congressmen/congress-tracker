import runpy
from pathlib import Path

import psycopg
from alembic.script import ScriptDirectory

from tests.conftest import TEST_DATABASE_URL

CHECKER = Path(__file__).resolve().parents[2] / "scripts/release-schema/check.py"


def run_check(db, monkeypatch, revision=None):
    head = revision or ScriptDirectory.from_config(db).get_current_head()
    monkeypatch.setenv("DATABASE_URL", TEST_DATABASE_URL)
    monkeypatch.setattr("sys.argv", [str(CHECKER), head])
    return runpy.run_path(str(CHECKER))["main"]()


def test_release_schema_accepts_the_head_and_its_objects(db, monkeypatch, capsys):
    assert run_check(db, monkeypatch) == 0
    assert "Supabase schema matches" in capsys.readouterr().out


def test_release_schema_stops_when_objects_are_missing_at_the_expected_head(
    db, monkeypatch, capsys
):
    with psycopg.connect(TEST_DATABASE_URL) as conn:
        conn.execute("ALTER TABLE issue_embeddings RENAME TO issue_embeddings_fixture")
        conn.execute("ALTER TABLE actions RENAME COLUMN request_id TO request_id_fixture")
    try:
        assert run_check(db, monkeypatch) == 1
        error = capsys.readouterr().err
        assert "public.issue_embeddings" in error
        assert "public.actions.request_id" in error
        assert "public.actions retry constraint" in error
    finally:
        with psycopg.connect(TEST_DATABASE_URL) as conn:
            conn.execute("ALTER TABLE issue_embeddings_fixture RENAME TO issue_embeddings")
            conn.execute("ALTER TABLE actions RENAME COLUMN request_id_fixture TO request_id")


def test_release_schema_reports_the_actual_revision_on_a_mismatch(db, monkeypatch, capsys):
    actual = ScriptDirectory.from_config(db).get_current_head()
    assert run_check(db, monkeypatch, "wrong_revision") == 1
    assert f"Expected wrong_revision, found {actual}." in capsys.readouterr().err
