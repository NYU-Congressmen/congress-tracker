import psycopg
from fastapi.testclient import TestClient

from app.main import app
from tests.conftest import TEST_DATABASE_URL


def test_stage_counts_come_from_one_grouped_query(db):
    with psycopg.connect(TEST_DATABASE_URL) as conn:
        conn.execute(
            """
            INSERT INTO bills (bill_id, congress, type, number, title, status) VALUES
                ('119-hr-1', 119, 'hr', 1, 'One', 'committee'),
                ('119-hr-2', 119, 'hr', 2, 'Two', 'committee'),
                ('119-hr-3', 119, 'hr', 3, 'Three', 'became_law')
            """
        )

    counts = TestClient(app).get("/api/bills/stage-counts").json()

    assert counts == {
        "introduced": 0,
        "committee": 2,
        "passed_one_chamber": 0,
        "passed_both_chambers": 0,
        "to_president": 0,
        "became_law": 1,
    }
