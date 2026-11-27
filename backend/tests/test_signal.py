import psycopg
import pytest
from fastapi.testclient import TestClient

from app.auth import current_uid
from app.main import app
from tests.conftest import TEST_DATABASE_URL

URL = "/api/bills/119/hr/1/signal"


def sql(statement: str, params: tuple = ()) -> None:
    with psycopg.connect(TEST_DATABASE_URL) as conn:
        conn.execute(statement, params)


def sign_in(uid: str) -> None:
    app.dependency_overrides[current_uid] = lambda: uid


@pytest.fixture
def client(db):
    """Store a bill, a New York delegation and readers inside and outside the past week."""
    sql(
        "INSERT INTO bills (bill_id, congress, type, number, title) "
        "VALUES ('119-hr-1', 119, 'hr', 1, 'Example Act')"
    )
    sql(
        """
        INSERT INTO members (bioguide_id, name, party, state, chamber, district, is_current) VALUES
            ('H000012', 'House Twelve', 'D', 'NY', 'House', 12, true),
            ('H000010', 'House Ten', 'D', 'NY', 'House', 10, true),
            ('S000001', 'Senator One', 'D', 'NY', 'Senate', NULL, true),
            ('S000002', 'Senator Two', 'D', 'NY', 'Senate', NULL, true)
        """
    )
    sql(
        """
        INSERT INTO users (uid, phone, state, district, is_sample) VALUES
            ('reader', '+15550000301', 'NY', 12, false),
            ('neighbor', '+15550000302', 'NY', 12, false),
            ('upstate', '+15550000303', 'NY', 10, false),
            ('stale', '+15550000304', 'NY', 12, false),
            ('sample-1', '+15550000305', 'NY', 12, true),
            ('maya', '+15550000306', 'NY', 12, true),
            ('nowhere', '+15550000307', NULL, NULL, false)
        """
    )
    sql(
        """
        INSERT INTO reviews (uid, bill_id, stance, consent_to_share, updated_at) VALUES
            ('reader', '119-hr-1', 'support', true, now() - interval '1 day'),
            ('neighbor', '119-hr-1', 'oppose', true, now() - interval '2 days'),
            ('upstate', '119-hr-1', 'support', true, now() - interval '3 days'),
            ('stale', '119-hr-1', 'support', true, now() - interval '10 days'),
            ('sample-1', '119-hr-1', 'unsure', true, now() - interval '1 day'),
            ('maya', '119-hr-1', 'support', false, now() - interval '1 day')
        """
    )
    sql("UPDATE reviews SET moderation_status = 'cleared'")
    sql(
        "INSERT INTO actions (uid, bill_id, bioguide_id, action_type, created_at) "
        "VALUES ('reader', '119-hr-1', 'H000012', 'call', now() - interval '1 day')"
    )
    sign_in("reader")
    yield TestClient(app)
    app.dependency_overrides.clear()


def counts(page: dict) -> dict[str, tuple[int, int, int, int]]:
    return {
        office["bioguide_id"]: (
            office["support"],
            office["oppose"],
            office["unsure"],
            office["calls"],
        )
        for office in page["offices"]
    }


def test_each_office_gets_its_constituents_from_the_past_week(client):
    page = client.get(URL).json()

    assert [office["bioguide_id"] for office in page["offices"]] == [
        "H000012",
        "S000001",
        "S000002",
    ]
    # The House office counts its district, and the senators count the whole state
    assert counts(page) == {
        "H000012": (1, 1, 0, 1),
        "S000001": (2, 1, 0, 0),
        "S000002": (2, 1, 0, 0),
    }
    assert (page["your_review"], page["includes_sample"]) == ("included", False)


def test_sample_activity_counts_only_for_a_sample_account(client):
    sign_in("maya")
    page = client.get(URL).json()

    assert page["includes_sample"] is True
    assert counts(page)["H000012"] == (1, 1, 1, 1)
    assert page["your_review"] == "not_consented"


def test_readers_without_a_review_or_district(client):
    sign_in("upstate")
    assert client.get(URL).json()["your_review"] == "included"
    sign_in("nowhere")
    page = client.get(URL).json()
    assert (page["offices"], page["your_review"]) == ([], "none")
    assert client.get("/api/bills/119/hr/9/signal").status_code == 404


def test_signal_needs_sign_in(db):
    assert TestClient(app).get(URL).status_code == 401
