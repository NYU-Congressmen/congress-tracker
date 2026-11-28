import psycopg
import pytest
from fastapi.testclient import TestClient

from app.auth import current_uid
from app.main import app
from tests.conftest import TEST_DATABASE_URL


def sql(statement: str, params: tuple = ()) -> None:
    with psycopg.connect(TEST_DATABASE_URL) as conn:
        conn.execute(statement, params)


@pytest.fixture
def client(db):
    """Store a delegation, House votes on four bills and a reader's stances and calls."""
    sql(
        """
        INSERT INTO bills (bill_id, congress, type, number, title, latest_action_date) VALUES
            ('119-hr-1', 119, 'hr', 1, 'Passed With You', '2026-03-01'),
            ('119-hr-2', 119, 'hr', 2, 'Passed Against You', '2026-03-02'),
            ('119-hr-3', 119, 'hr', 3, 'Skipped Vote', '2026-03-03'),
            ('119-hr-4', 119, 'hr', 4, 'Unsure Bill', '2026-03-04'),
            ('119-hr-5', 119, 'hr', 5, 'Tracked Only', '2026-03-05')
        """
    )
    sql(
        """
        INSERT INTO members (bioguide_id, name, party, state, chamber, district, is_current) VALUES
            ('H000012', 'House Twelve', 'D', 'NY', 'House', 12, true),
            ('S000001', 'Senator One', 'D', 'NY', 'Senate', NULL, true)
        """
    )
    sql(
        "INSERT INTO users (uid, phone, state, district) "
        "VALUES ('reader', '+15550000501', 'NY', 12)"
    )
    sql(
        """
        INSERT INTO house_votes (congress, session, roll_number, bill_id, vote_date, question)
        VALUES
            (119, 1, 10, '119-hr-1', '2026-01-10', 'On Passage'),
            (119, 1, 11, '119-hr-1', '2026-01-09', 'On Motion to Recommit'),
            (119, 1, 20, '119-hr-2', '2026-01-20', 'On Motion to Suspend the Rules and Pass'),
            (119, 1, 30, '119-hr-3', '2026-01-30', 'On Passage'),
            (119, 1, 40, '119-hr-4', '2026-02-01', 'On Passage')
        """
    )
    sql(
        """
        INSERT INTO house_vote_positions (congress, session, roll_number, bioguide_id, position)
        VALUES
            (119, 1, 10, 'H000012', 'Yea'),
            (119, 1, 11, 'H000012', 'Nay'),
            (119, 1, 20, 'H000012', 'Aye'),
            (119, 1, 30, 'H000012', 'Not Voting'),
            (119, 1, 40, 'H000012', 'Yea')
        """
    )
    sql(
        """
        INSERT INTO reviews (uid, bill_id, stance) VALUES
            ('reader', '119-hr-1', 'support'),
            ('reader', '119-hr-2', 'oppose'),
            ('reader', '119-hr-3', 'support'),
            ('reader', '119-hr-4', 'unsure')
        """
    )
    sql("INSERT INTO tracked_bills (uid, bill_id) VALUES ('reader', '119-hr-5')")
    sql(
        "INSERT INTO notifications (uid, bill_id, type, message) "
        "VALUES ('reader', '119-hr-5', 'latest_action', 'Mar 5, 2026: Introduced.')"
    )
    sql(
        "INSERT INTO actions (uid, bill_id, bioguide_id, action_type) "
        "VALUES ('reader', '119-hr-1', 'H000012', 'call'), "
        "('reader', '119-hr-2', 'H000012', 'call')"
    )
    app.dependency_overrides[current_uid] = lambda: "reader"
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_house_record_compares_final_votes_with_the_readers_sides(client):
    house, senate = client.get("/api/account/representatives").json()

    assert (house["bioguide_id"], house["your_calls"]) == ("H000012", 2)
    record = house["voting_record"]
    # The passage vote counts, not the motion to recommit, and Unsure is never compared
    assert (record["compared"], record["agreed"], record["missed"]) == (2, 1, 1)
    assert {vote["bill_id"]: vote["agrees"] for vote in record["votes"]} == {
        "119-hr-1": True,
        "119-hr-2": False,
        "119-hr-3": None,
    }
    assert (senate["chamber"], senate["voting_record"], senate["your_calls"]) == ("Senate", None, 0)


def test_asks_list_stances_and_tracked_bills_with_updates_first(client):
    asks = client.get("/api/account/asks").json()

    assert [ask["bill_id"] for ask in asks][0] == "119-hr-5"
    by_bill = {ask["bill_id"]: ask for ask in asks}
    assert len(by_bill) == 5
    assert (by_bill["119-hr-5"]["stance"], by_bill["119-hr-5"]["tracking"]) == (None, True)
    assert (by_bill["119-hr-5"]["unread"], by_bill["119-hr-1"]["calls"]) == (1, 1)
    assert by_bill["119-hr-2"]["stance"] == "oppose"


def test_a_reader_without_a_district_has_no_representatives(client):
    sql("UPDATE users SET state = NULL, district = NULL")
    assert client.get("/api/account/representatives").json() == []


def test_representatives_need_sign_in(db):
    assert TestClient(app).get("/api/account/representatives").status_code == 401
