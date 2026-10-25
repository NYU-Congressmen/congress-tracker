from itertools import islice
from typing import Any

from app.db import execute_many
from app.sync.client import CongressClient
from app.sync.status import status_from_action

CONGRESS = 119

SAVE_BILL_SQL = """
    INSERT INTO bills (bill_id, congress, type, number, title, status,
                       introduced_date, latest_action_date, latest_action_text, update_date)
    VALUES (%(bill_id)s, %(congress)s, %(type)s, %(number)s, %(title)s, %(status)s,
            %(introduced_date)s, %(latest_action_date)s, %(latest_action_text)s, %(update_date)s)
    ON CONFLICT (bill_id) DO UPDATE SET
        title = EXCLUDED.title,
        status = EXCLUDED.status,
        latest_action_date = EXCLUDED.latest_action_date,
        latest_action_text = EXCLUDED.latest_action_text,
        update_date = EXCLUDED.update_date
"""


def clean_bill(b: dict[str, Any]) -> dict[str, Any]:
    # Turn one bill from the Congress.gov list into a row for the bills table.
    latest = b.get("latestAction") or {}
    bill_type = b["type"].lower()
    return {
        "bill_id": f"{b['congress']}-{bill_type}-{b['number']}",
        "congress": b["congress"],
        "type": bill_type,
        "number": int(b["number"]),
        "title": b["title"],
        # The list only has the latest action, which is the best guess until we fetch history
        "status": status_from_action(None, latest.get("text")),
        "introduced_date": b.get("introducedDate"),
        "latest_action_date": latest.get("actionDate"),
        "latest_action_text": latest.get("text"),
        "update_date": b.get("updateDateIncludingText") or b.get("updateDate"),
    }


def sync_bills(client: CongressClient, max_items: int | None = None) -> int:
    # Download bills of the current Congress, newest changes first, and upsert them.
    bills = client.paginate(f"/bill/{CONGRESS}", "bills", sort="updateDate desc")
    rows = [clean_bill(b) for b in islice(bills, max_items)]
    execute_many(SAVE_BILL_SQL, rows)
    return len(rows)
