from itertools import islice
from typing import Any

from app.db import execute_many
from app.sync.client import CongressClient
from app.sync.status import NEVER_DOWNGRADE_SQL, summarize_actions

CONGRESS = 119

SAVE_BILL_SQL = f"""
    INSERT INTO bills (bill_id, congress, type, number, title, status,
                       introduced_date, latest_action_date, latest_action_text, update_date,
                       passed_house, passed_senate)
    VALUES (%(bill_id)s, %(congress)s, %(type)s, %(number)s, %(title)s, %(status)s,
            %(introduced_date)s, %(latest_action_date)s, %(latest_action_text)s, %(update_date)s,
            %(passed_house)s, %(passed_senate)s)
    ON CONFLICT (bill_id) DO UPDATE SET
        title = EXCLUDED.title,
        status = {NEVER_DOWNGRADE_SQL},
        passed_house = bills.passed_house OR EXCLUDED.passed_house,
        passed_senate = bills.passed_senate OR EXCLUDED.passed_senate,
        latest_action_date = EXCLUDED.latest_action_date,
        latest_action_text = EXCLUDED.latest_action_text,
        update_date = GREATEST(bills.update_date, EXCLUDED.update_date)
"""


def make_bill_id(congress: int | str, bill_type: str, number: int | str) -> str:
    """Return the text key a bill is stored under, such as 119-hr-1."""
    return f"{congress}-{bill_type.lower()}-{int(number)}"


def clean_bill(b: dict[str, Any]) -> dict[str, Any]:
    """Turn one bill from the Congress.gov bill list into a row for the bills table."""
    latest = b.get("latestAction") or {}
    bill_type = b["type"].lower()
    return {
        "bill_id": make_bill_id(b["congress"], bill_type, b["number"]),
        "congress": b["congress"],
        "type": bill_type,
        "number": int(b["number"]),
        "title": b["title"],
        # The list only has the latest action, so this is a guess until the history is cached
        **summarize_actions([latest], bill_type),
        "introduced_date": b.get("introducedDate"),
        "latest_action_date": latest.get("actionDate"),
        "latest_action_text": latest.get("text"),
        "update_date": b.get("updateDateIncludingText") or b.get("updateDate"),
    }


def sync_bills(client: CongressClient, max_items: int | None = None) -> int:
    """Download bills of the current Congress, newest changes first, and return how many."""
    bills = client.paginate(f"/bill/{CONGRESS}", "bills", sort="updateDate desc")
    rows = [clean_bill(b) for b in islice(bills, max_items)]
    execute_many(SAVE_BILL_SQL, rows)
    return len(rows)
