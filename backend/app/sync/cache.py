from datetime import UTC, datetime, timedelta
from typing import Any

import psycopg

from app.db import connect
from app.sync.bills import CONGRESS, clean_bill
from app.sync.client import CongressClient
from app.sync.members import SAVE_MEMBER_SQL, clean_member_detail
from app.sync.status import NEVER_DOWNGRADE_SQL, STAGES, furthest_status

# Sponsorship has no update date to compare against, so it is refreshed on a schedule
SPONSORED_MAX_AGE = timedelta(days=1)

SAVE_DETAIL_SQL = f"""
    INSERT INTO bills (bill_id, congress, type, number, title, policy_area, sponsor_id, status,
                       introduced_date, latest_action_date, latest_action_text, update_date,
                       details_synced_at)
    VALUES (%(bill_id)s, %(congress)s, %(type)s, %(number)s, %(title)s, %(policy_area)s,
            %(sponsor_id)s, %(status)s, %(introduced_date)s, %(latest_action_date)s,
            %(latest_action_text)s, %(update_date)s, now())
    ON CONFLICT (bill_id) DO UPDATE SET
        title = EXCLUDED.title,
        policy_area = EXCLUDED.policy_area,
        sponsor_id = EXCLUDED.sponsor_id,
        status = {NEVER_DOWNGRADE_SQL},
        introduced_date = EXCLUDED.introduced_date,
        latest_action_date = EXCLUDED.latest_action_date,
        latest_action_text = EXCLUDED.latest_action_text,
        update_date = EXCLUDED.update_date,
        details_synced_at = now()
"""

SAVE_ACTION_SQL = """
    INSERT INTO bill_actions (bill_id, action_date, type, text)
    VALUES (%(bill_id)s, %(action_date)s, %(type)s, %(text)s)
"""

SAVE_SPONSORED_SQL = """
    INSERT INTO bills (bill_id, congress, type, number, title, status, introduced_date,
                       latest_action_date, latest_action_text, sponsor_id)
    VALUES (%(bill_id)s, %(congress)s, %(type)s, %(number)s, %(title)s, %(status)s,
            %(introduced_date)s, %(latest_action_date)s, %(latest_action_text)s, %(sponsor_id)s)
    ON CONFLICT (bill_id) DO UPDATE SET sponsor_id = EXCLUDED.sponsor_id
"""


def bill_needs_refresh(row: dict[str, Any] | None) -> bool:
    """Return whether a cached bill is missing its details or changed after they were fetched."""
    if row is None or row["details_synced_at"] is None:
        return True
    return row["update_date"] is not None and row["update_date"] > row["details_synced_at"]


def sponsored_needs_refresh(member: dict[str, Any]) -> bool:
    """Return whether a member's sponsored bills were never cached or are older than a day."""
    synced = member["sponsored_synced_at"]
    return synced is None or datetime.now(UTC) - synced > SPONSORED_MAX_AGE


def ensure_member(conn: psycopg.Connection, client: CongressClient, bioguide_id: str) -> None:
    """Store a member from the detail endpoint when a bill refers to one not yet stored."""
    if conn.execute("SELECT 1 FROM members WHERE bioguide_id = %s", (bioguide_id,)).fetchone():
        return
    # Sponsors can be former members, who are absent from the current-member sync
    detail = client.get(f"/member/{bioguide_id}")["member"]
    conn.execute(SAVE_MEMBER_SQL, clean_member_detail(detail))


def refresh_bill(client: CongressClient, congress: int, bill_type: str, number: int) -> str:
    """Fetch a bill's detail and actions from Congress.gov, cache them and return its bill_id."""
    path = f"/bill/{congress}/{bill_type}/{number}"
    detail = client.get(path)["bill"]
    actions = list(client.paginate(f"{path}/actions", "actions"))

    row = clean_bill(detail)
    row["policy_area"] = (detail.get("policyArea") or {}).get("name")
    sponsors = detail.get("sponsors") or []
    row["sponsor_id"] = sponsors[0]["bioguideId"] if sponsors else None
    row["status"] = max(row["status"], furthest_status(actions, bill_type), key=STAGES.index)

    # One transaction, so a failure part way leaves the previous cache intact
    with connect() as conn:
        if row["sponsor_id"]:
            ensure_member(conn, client, row["sponsor_id"])
        conn.execute(SAVE_DETAIL_SQL, row)
        conn.execute("DELETE FROM bill_actions WHERE bill_id = %s", (row["bill_id"],))
        conn.cursor().executemany(
            SAVE_ACTION_SQL,
            [
                {
                    "bill_id": row["bill_id"],
                    "action_date": a.get("actionDate"),
                    "type": a.get("type"),
                    "text": a.get("text"),
                }
                for a in actions
            ],
        )
    return row["bill_id"]


def refresh_sponsored(client: CongressClient, bioguide_id: str) -> int:
    """Cache which current-Congress bills a member sponsored and return how many there are."""
    rows = []
    path = f"/member/{bioguide_id}/sponsored-legislation"
    # Every page is read, because the list mixes Congresses rather than running strictly by date
    for item in client.paginate(path, "sponsoredLegislation"):
        # Amendments appear in the list too and have no bill type
        if item.get("congress") == CONGRESS and item.get("type") and item.get("number"):
            rows.append({**clean_bill(item), "sponsor_id": bioguide_id})
    with connect() as conn:
        conn.cursor().executemany(SAVE_SPONSORED_SQL, rows)
        conn.execute(
            "UPDATE members SET sponsored_synced_at = now() WHERE bioguide_id = %s", (bioguide_id,)
        )
    return len(rows)
