import httpx

from app.sync.client import CongressClient
from app.sync.summaries import clean_summary, sync_summaries

# Trimmed from a real /summaries/119 response
SUMMARY = {
    "actionDate": "2026-02-11",
    "actionDesc": "Introduced in Senate",
    "bill": {"congress": 119, "number": "3848", "type": "S"},
    "text": "<p><strong>Apples to Apples Comparison Act of 2026</strong></p>",
    "updateDate": "2026-11-05T14:00:00Z",
    "versionCode": "00",
}


def test_clean_summary():
    row = clean_summary(SUMMARY)
    # The same lowercase key as the bills table
    assert row["bill_id"] == "119-s-3848"
    # Stored as text, so the leading zero survives
    assert row["version_code"] == "00"
    assert row["action_date"] == "2026-02-11"
    # Stored as the HTML CRS wrote
    assert row["text"].startswith("<p>")


def test_sync_skips_unknown_bills_and_empty_summaries(monkeypatch):
    unknown = {**SUMMARY, "bill": {"congress": 119, "number": "1", "type": "HR"}}
    empty = {**SUMMARY, "versionCode": "07", "text": ""}
    summaries = [SUMMARY, unknown, empty]
    saved = []

    def fake_api(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"summaries": summaries, "pagination": {"count": 3}})

    monkeypatch.setattr("app.sync.summaries.fetch_all", lambda sql: [{"bill_id": "119-s-3848"}])
    monkeypatch.setattr("app.sync.summaries.execute_many", lambda sql, rows: saved.extend(rows))
    with CongressClient("test-key", transport=httpx.MockTransport(fake_api)) as client:
        assert sync_summaries(client) == 1
    assert [row["version_code"] for row in saved] == ["00"]
