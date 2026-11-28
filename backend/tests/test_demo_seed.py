import psycopg
from fastapi.testclient import TestClient

from app.auth import optional_uid
from app.db import connect
from app.demo_seed import VIEWER_UID, seed
from app.main import app
from tests.conftest import TEST_DATABASE_URL

client = TestClient(app)


def test_seed_is_repeatable_and_stays_out_of_public_counts(db):
    with psycopg.connect(TEST_DATABASE_URL) as conn:
        conn.execute(
            "INSERT INTO bills (bill_id, congress, type, number, title) VALUES "
            "('119-s-3108', 119, 's', 3108, 'AI-Related Job Impacts Clarity Act'), "
            "('119-hr-9352', 119, 'hr', 9352, 'AI-Related Job Impacts Clarity Act')"
        )
        conn.execute(
            "INSERT INTO bills (bill_id, congress, type, number, title, latest_action_date, "
            "latest_action_text) VALUES ('119-hr-1190', 119, 'hr', 1190, 'Rural Capital Act', "
            "'2026-10-14', 'Message on Senate action sent to the House.')"
        )
        conn.execute(
            "INSERT INTO members (bioguide_id, name, state, chamber, district, is_current) VALUES "
            "('N000002', 'Nadler, Jerrold', 'NY', 'House', 12, true), "
            "('S000148', 'Schumer, Charles E.', 'NY', 'Senate', NULL, true), "
            "('G000555', 'Gillibrand, Kirsten E.', 'NY', 'Senate', NULL, true)"
        )
        conn.execute("INSERT INTO users (uid, phone) VALUES ('real-reader', '+16505550177')")
        conn.execute(
            "INSERT INTO reviews (uid, bill_id, stance) "
            "VALUES ('real-reader', '119-s-3108', 'oppose')"
        )

    counted = []
    for _ in range(2):
        with connect() as conn:
            counts = seed(conn)
        with psycopg.connect(TEST_DATABASE_URL) as conn:
            counted.append(
                conn.execute(
                    "SELECT count(*), count(*) FILTER (WHERE NOT u.is_sample) "
                    "FROM reviews r JOIN users u USING (uid)"
                ).fetchone()
            )
            calls = conn.execute(
                "SELECT count(*) FROM actions WHERE uid = %s", (VIEWER_UID,)
            ).fetchone()[0]
            tracked = conn.execute(
                "SELECT count(*) FROM tracked_bills WHERE uid = %s", (VIEWER_UID,)
            ).fetchone()[0]
            updates = conn.execute(
                "SELECT bill_id, message FROM notifications WHERE uid = %s", (VIEWER_UID,)
            ).fetchall()
    assert counted[0] == counted[1]
    assert counted[0][1] == 1
    assert counts["bills"] == 3 and calls == 3
    # The viewer tracks the seeded bills, and only the one with an action since has an update
    assert tracked == 2
    assert updates == [("119-hr-1190", "Oct 14, 2026: Message on Senate action sent to the House.")]
    with psycopg.connect(TEST_DATABASE_URL) as conn:
        statuses = conn.execute(
            "SELECT DISTINCT moderation_status FROM reviews WHERE uid <> 'real-reader'"
        ).fetchall()
    assert statuses == [("cleared",)]

    url = "/api/bills/119/s/3108/responses"
    public = client.get(url).json()
    assert (public["total"], public["includes_sample"]) == (1, False)
    app.dependency_overrides[optional_uid] = lambda: VIEWER_UID
    try:
        sample = client.get(url).json()
    finally:
        app.dependency_overrides.pop(optional_uid, None)
    assert sample["includes_sample"] is True
    assert sample["total"] > 100
