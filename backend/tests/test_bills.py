import httpx

from app.sync.bills import clean_bill, sync_bills
from app.sync.client import CongressClient

BILL = {
    "congress": 119,
    "type": "HR",
    "number": "1",  # the API sends numbers as text
    "title": "One Big Beautiful Bill Act",
    "introducedDate": "2025-05-20",
    "latestAction": {"actionDate": "2025-07-04", "text": "Became Public Law No: 119-21."},
    "updateDate": "2026-09-19",
}


def test_clean_bill():
    row = clean_bill(BILL)
    assert row["bill_id"] == "119-hr-1"
    assert row["type"] == "hr"
    assert row["number"] == 1  # stored as an integer so bills sort numerically
    assert row["status"] == "became_law"
    assert row["latest_action_date"] == "2025-07-04"


def test_full_sync_uses_the_default_order_and_saves_each_bill_once(monkeypatch):
    sorts, saved = [], []

    def fake_api(request: httpx.Request) -> httpx.Response:
        sorts.append(request.url.params.get("sort"))
        # The same bill twice, as when it is updated while the sync is running
        return httpx.Response(200, json={"bills": [BILL, BILL], "pagination": {"count": 1}})

    # Record the rows instead of writing them, so this test needs no database
    monkeypatch.setattr("app.sync.bills.execute_many", lambda sql, rows: saved.extend(rows))
    with CongressClient("test-key", transport=httpx.MockTransport(fake_api)) as client:
        assert sync_bills(client) == 1
        assert sync_bills(client, max_items=1) == 1
    assert sorts == [None, None, "updateDate desc"]
    assert [row["bill_id"] for row in saved] == ["119-hr-1", "119-hr-1"]
