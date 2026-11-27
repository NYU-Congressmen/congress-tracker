import psycopg
import pytest
from fastapi.testclient import TestClient

from app.auth import current_uid
from app.db import connect
from app.main import app
from app.tracking import notify_tracked_updates
from tests.conftest import TEST_DATABASE_URL

TRACK = "/api/bills/119/hr/1/track"


def sql(statement: str, params: tuple = ()) -> list[tuple]:
    with psycopg.connect(TEST_DATABASE_URL) as conn:
        cursor = conn.execute(statement, params)
        return cursor.fetchall() if cursor.description else []


@pytest.fixture
def client(db):
    """Store two bills and two readers, with the first reader signed in."""
    sql(
        "INSERT INTO bills (bill_id, congress, type, number, title, latest_action_date, "
        "latest_action_text) VALUES "
        "('119-hr-1', 119, 'hr', 1, 'Example Act', '2026-01-05', 'Referred to committee.'), "
        "('119-hr-2', 119, 'hr', 2, 'Second Act', '2026-01-05', 'Introduced in House.')"
    )
    sql(
        "INSERT INTO users (uid, phone) VALUES "
        "('reader', '+15550000201'), ('other', '+15550000202')"
    )
    app.dependency_overrides[current_uid] = lambda: "reader"
    yield TestClient(app)
    app.dependency_overrides.clear()


def notify() -> int:
    with connect() as conn:
        return notify_tracked_updates(conn)


def test_tracking_a_bill_and_stopping(client):
    assert client.get(TRACK).json() == {"tracking": False}
    assert client.put(TRACK).json() == {"tracking": True}
    assert client.put(TRACK).json() == {"tracking": True}
    assert client.get(TRACK).json() == {"tracking": True}
    assert [bill["bill_id"] for bill in client.get("/api/account/tracked").json()] == ["119-hr-1"]

    assert client.delete(TRACK).json() == {"tracking": False}
    assert client.get("/api/account/tracked").json() == []


def test_tracking_needs_a_known_bill_and_account(client):
    assert client.put("/api/bills/119/hr/9/track").status_code == 404
    app.dependency_overrides[current_uid] = lambda: "nobody"
    assert client.put(TRACK).status_code == 403


def test_a_new_action_notifies_each_tracker_once(client):
    client.put(TRACK)
    sql("INSERT INTO tracked_bills (uid, bill_id) VALUES ('other', '119-hr-1')")
    # Actions on or before the day someone started tracking are not news to them
    sql("UPDATE tracked_bills SET followed_at = '2026-01-05 15:00+00'")
    assert notify() == 0

    sql(
        "UPDATE bills SET latest_action_date = '2026-02-10', "
        "latest_action_text = 'Passed the House.' WHERE bill_id = '119-hr-1'"
    )
    assert notify() == 2
    assert notify() == 0

    page = client.get("/api/account/notifications").json()
    assert page["unread"] == 1
    (note,) = page["data"]
    assert (note["message"], note["type"], note["number"]) == (
        "Feb 10, 2026: Passed the House.",
        "hr",
        1,
    )
    assert client.get("/api/account/tracked").json()[0]["unread"] == 1

    # Opening the bill marks its updates read for this reader only
    read = client.put("/api/account/notifications/read", json={"bill_id": "119-hr-1"}).json()
    assert read["unread"] == 0 and read["data"][0]["is_read"] is True
    assert sql("SELECT count(*) FROM notifications WHERE uid = 'other' AND NOT is_read") == [(1,)]
    assert sql("SELECT last_seen_at IS NOT NULL FROM tracked_bills WHERE uid = 'reader'") == [
        (True,)
    ]

    # Untracking drops the bill's updates from the account
    client.delete(TRACK)
    assert client.get("/api/account/notifications").json() == {"unread": 0, "data": []}


def test_notifications_need_sign_in(db):
    plain = TestClient(app)
    assert plain.get("/api/account/notifications").status_code == 401
    assert plain.put(TRACK).status_code == 401
