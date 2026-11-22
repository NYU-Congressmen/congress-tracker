from datetime import UTC, datetime
from typing import Any

from app.db import execute_many, fetch_all
from app.sync.bills import CONGRESS, make_bill_id
from app.sync.client import CongressClient

# The 119th Congress began on January 3, 2025, so no summary of its bills is older
CONGRESS_START = "2025-01-03T00:00:00Z"

SAVE_SUMMARY_SQL = """
INSERT INTO bill_summaries (bill_id, version_code, action_date, action_desc, text, update_date)
VALUES (%(bill_id)s, %(version_code)s, %(action_date)s, %(action_desc)s, %(text)s, %(update_date)s)
ON CONFLICT (bill_id, version_code) DO UPDATE SET
action_date=EXCLUDED.action_date,
action_desc=EXCLUDED.action_desc,
text=EXCLUDED.text,
update_date=EXCLUDED.update_date
"""


def clean_summary(s: dict[str, Any]) -> dict[str, Any]:
    """Turn one summary from the Congress.gov summary list into a row for bill_summaries."""
    bill = s["bill"]
    return {
        "bill_id": make_bill_id(bill["congress"], bill["type"], bill["number"]),
        "version_code": s["versionCode"],
        "action_date": s.get("actionDate"),
        "action_desc": s.get("actionDesc"),
        "text": s["text"],
        "update_date": s.get("updateDate"),
    }


def sync_summaries(client: CongressClient) -> int:
    """Download every CRS summary of the current Congress in bulk and return how many were saved."""
    # Without a date range the API returns only the most recent handful
    now = datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
    summaries = client.collect(
        f"/summaries/{CONGRESS}",
        "summaries",
        lambda s: (s["bill"]["type"], s["bill"]["number"], s["versionCode"]),
        fromDateTime=CONGRESS_START,
        toDateTime=now,
    )

    # A summary can arrive before its bill does, and the foreign key would reject it
    known = {row["bill_id"] for row in fetch_all("SELECT bill_id FROM bills")}
    rows = [clean_summary(s) for s in summaries if s.get("text")]
    rows = [row for row in rows if row["bill_id"] in known]
    execute_many(SAVE_SUMMARY_SQL, rows)
    return len(rows)
