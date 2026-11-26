import psycopg
import pytest
from fastapi.testclient import TestClient

from app.auth import optional_uid
from app.main import app
from tests.conftest import TEST_DATABASE_URL

URL = "/api/bills/119/hr/1/responses"

# Each user's state, district and stance on the bill; None means they did not respond
PEOPLE = [
    ("ny-12-a", "NY", 12, "support"),
    ("ny-12-b", "NY", 12, "oppose"),
    ("ny-10", "NY", 10, "support"),
    ("wy", "WY", None, "unsure"),
    ("no-district", None, None, "support"),
    ("ny-12-silent", "NY", 12, None),
]


@pytest.fixture
def client(db):
    """Store one bill, six verified users and the reviews five of them wrote."""
    with psycopg.connect(TEST_DATABASE_URL) as conn:
        conn.execute(
            "INSERT INTO bills (bill_id, congress, type, number, title) "
            "VALUES ('119-hr-1', 119, 'hr', 1, 'Example Act')"
        )
        for index, (uid, state, district, stance) in enumerate(PEOPLE):
            conn.execute(
                "INSERT INTO users (uid, phone, state, district) VALUES (%s, %s, %s, %s)",
                (uid, f"+1555000000{index}", state, district),
            )
            if stance:
                conn.execute(
                    "INSERT INTO reviews (uid, bill_id, stance) VALUES (%s, '119-hr-1', %s)",
                    (uid, stance),
                )
    return TestClient(app)


def test_counts_every_verified_response(client):
    body = client.get(URL).json()

    assert body["label"] == "Verified Pull users who responded"
    assert body["counts"] == {"support": 3, "oppose": 1, "unsure": 1}
    assert body["total"] == 5
    assert (body["state"], body["district"]) == (None, None)


def test_filters_by_state_and_by_district(client):
    state = client.get(URL, params={"state": "ny"}).json()
    district = client.get(URL, params={"state": "NY", "district": 12}).json()

    assert state["state"] == "NY"
    assert state["counts"] == {"support": 2, "oppose": 1, "unsure": 0}
    assert district["counts"] == {"support": 1, "oppose": 1, "unsure": 0}
    assert district["district"] == 12


def test_an_at_large_state_is_counted_by_state_alone(client):
    assert client.get(URL, params={"state": "WY"}).json()["counts"]["unsure"] == 1


def test_reviews_their_authors_hid_are_not_counted(client):
    with psycopg.connect(TEST_DATABASE_URL) as conn:
        conn.execute("UPDATE reviews SET hidden_at = now() WHERE uid = 'ny-12-b'")

    assert client.get(URL, params={"state": "NY", "district": 12}).json()["total"] == 1


def test_a_bill_nobody_reviewed_counts_zero(client):
    with psycopg.connect(TEST_DATABASE_URL) as conn:
        conn.execute(
            "INSERT INTO bills (bill_id, congress, type, number, title) "
            "VALUES ('119-s-5', 119, 's', 5, 'Quiet Act')"
        )

    body = client.get("/api/bills/119/s/5/responses").json()

    assert body["total"] == 0
    assert body["counts"] == {"support": 0, "oppose": 0, "unsure": 0}


def test_bad_filters_and_unknown_bills_are_refused(client):
    assert client.get(URL, params={"district": 12}).status_code == 422
    assert client.get(URL, params={"state": "New York"}).status_code == 422
    assert client.get("/api/bills/119/hr/999/responses").status_code == 404


def test_sample_accounts_count_only_for_a_sample_viewer(client):
    with psycopg.connect(TEST_DATABASE_URL) as conn:
        conn.execute(
            "INSERT INTO users (uid, phone, state, district, is_sample) VALUES "
            "('sample-voter', '+15550000100', 'NY', 12, true), "
            "('demo-viewer', '+15550000101', 'NY', 12, true)"
        )
        conn.execute(
            "INSERT INTO reviews (uid, bill_id, stance, share_publicly) "
            "VALUES ('sample-voter', '119-hr-1', 'oppose', true)"
        )
        conn.execute(
            "UPDATE reviews SET share_publicly = true "
            "WHERE uid = 'ny-12-a' AND bill_id = '119-hr-1'"
        )
    reviews_url = "/api/bills/119/hr/1/reviews"
    try:
        for viewer in (None, "ny-10"):
            app.dependency_overrides[optional_uid] = lambda viewer=viewer: viewer
            body = client.get(URL).json()
            assert (body["total"], body["includes_sample"]) == (5, False)
            assert client.get(reviews_url).json()["total"] == 1

        app.dependency_overrides[optional_uid] = lambda: "demo-viewer"
        response = client.get(URL)
        body = response.json()
        assert body["counts"]["oppose"] == 2
        assert (body["total"], body["includes_sample"]) == (6, True)
        assert response.headers["cache-control"] == "private, no-store"
        assert client.get(reviews_url).json()["total"] == 2
    finally:
        app.dependency_overrides.pop(optional_uid, None)
