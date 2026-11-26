import re
from typing import Any

import httpx

from app.db import connect
from app.sync.bills import make_bill_id
from app.sync.client import CongressClient
from app.sync.followed import followed_bills

# Congress.gov mixes readable relationships with codes such as SecondaryCompanionBillBecameLaw,
# which read as if the related bill itself became law, so codes are left out
CODE_NAME = re.compile(r"^[A-Z][a-z]+(?:[A-Z][a-z]+)+$")

SAVE_COSPONSOR_SQL = """
    INSERT INTO bill_cosponsors (bill_id, bioguide_id, name, party, state, district,
                                 sponsorship_date, is_original, withdrawn_date)
    VALUES (%(bill_id)s, %(bioguide_id)s, %(name)s, %(party)s, %(state)s, %(district)s,
            %(sponsorship_date)s, %(is_original)s, %(withdrawn_date)s)
"""

SAVE_COMMITTEE_SQL = """
    INSERT INTO bill_committees (bill_id, system_code, name, chamber, type, parent_code,
                                 latest_activity, latest_activity_date)
    VALUES (%(bill_id)s, %(system_code)s, %(name)s, %(chamber)s, %(type)s, %(parent_code)s,
            %(latest_activity)s, %(latest_activity_date)s)
"""

SAVE_RELATED_SQL = """
    INSERT INTO related_bills (bill_id, related_bill_id, congress, type, number, title,
                               relationship, identified_by, latest_action_date,
                               latest_action_text)
    VALUES (%(bill_id)s, %(related_bill_id)s, %(congress)s, %(type)s, %(number)s, %(title)s,
            %(relationship)s, %(identified_by)s, %(latest_action_date)s,
            %(latest_action_text)s)
"""

# Records the bill version the edges came from, so they count as fresh until the bill changes
MARK_GRAPH_SYNCED_SQL = """
    UPDATE bills SET graph_synced_at = now(), graph_update_date = update_date,
                     graph_retry_after = NULL
    WHERE bill_id = %s
"""


def graph_needs_refresh(row: dict[str, Any]) -> bool:
    """Return whether a bill's edges were never fetched or the bill changed since."""
    if row["graph_synced_at"] is None:
        return True
    version = row["graph_update_date"]
    return row["update_date"] is not None and (version is None or row["update_date"] > version)


def as_int(value: Any) -> int | None:
    """Return a number Congress.gov may send as text, or None when there is none."""
    if value is None or value == "":
        return None
    return int(value)


def clean_cosponsor(bill_id: str, c: dict[str, Any]) -> dict[str, Any]:
    """Turn one cosponsor from Congress.gov into a bill_cosponsors row."""
    return {
        "bill_id": bill_id,
        "bioguide_id": c["bioguideId"],
        "name": c.get("fullName") or c["bioguideId"],
        "party": c.get("party"),
        "state": c.get("state"),
        "district": as_int(c.get("district")),
        "sponsorship_date": c.get("sponsorshipDate"),
        # The XML documentation shows "True", while JSON responses send a boolean
        "is_original": c.get("isOriginalCosponsor") in (True, "True", "true"),
        "withdrawn_date": c.get("sponsorshipWithdrawnDate"),
    }


def latest_activity(committee: dict[str, Any]) -> tuple[str | None, str | None]:
    """Return the name and date of a committee's most recent activity on the bill."""
    activities = [a for a in committee.get("activities") or [] if a.get("date")]
    if not activities:
        return None, None
    latest = max(activities, key=lambda a: a["date"])
    return latest.get("name"), latest["date"]


def clean_committees(bill_id: str, committees: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Turn a bill's committees and their subcommittees into bill_committees rows."""
    rows: dict[str, dict[str, Any]] = {}

    def add(committee: dict[str, Any], parent: dict[str, Any] | None) -> None:
        activity, activity_date = latest_activity(committee)
        rows[committee["systemCode"]] = {
            "bill_id": bill_id,
            "system_code": committee["systemCode"],
            "name": committee["name"],
            # Subcommittees leave out the chamber, which is always their parent's
            "chamber": committee.get("chamber") or (parent or {}).get("chamber"),
            "type": committee.get("type") or ("Subcommittee" if parent else None),
            "parent_code": parent["systemCode"] if parent else None,
            "latest_activity": activity,
            "latest_activity_date": activity_date,
        }

    for committee in committees:
        add(committee, None)
        for subcommittee in committee.get("subcommittees") or []:
            add(subcommittee, committee)
    return list(rows.values())


def clean_related(bill_id: str, r: dict[str, Any]) -> dict[str, Any]:
    """Turn one related bill from Congress.gov into a related_bills row."""
    details = r.get("relationshipDetails") or []
    kinds = sorted({d["type"] for d in details if d.get("type") and not CODE_NAME.match(d["type"])})
    sources = sorted({d["identifiedBy"] for d in details if d.get("identifiedBy")})
    latest = r.get("latestAction") or {}
    return {
        "bill_id": bill_id,
        "related_bill_id": make_bill_id(r["congress"], r["type"], r["number"]),
        "congress": r["congress"],
        "type": r["type"].lower(),
        "number": int(r["number"]),
        "title": r.get("title"),
        "relationship": "; ".join(kinds) or "Related bill",
        "identified_by": ", ".join(sources) or None,
        "latest_action_date": latest.get("actionDate"),
        "latest_action_text": latest.get("text"),
    }


def refresh_graph(client: CongressClient, congress: int, bill_type: str, number: int) -> None:
    """Fetch a bill's cosponsors, committees and related bills and replace the stored edges."""
    path = f"/bill/{congress}/{bill_type}/{number}"
    bill_id = make_bill_id(congress, bill_type, number)
    cosponsors = list(client.paginate(f"{path}/cosponsors", "cosponsors"))
    committees = list(client.paginate(f"{path}/committees", "committees"))
    related = list(client.paginate(f"{path}/relatedbills", "relatedBills"))

    # Every upstream call finishes before the transaction, so a failure keeps the old edges
    cosponsor_rows = {c["bioguideId"]: clean_cosponsor(bill_id, c) for c in cosponsors}
    related_rows = {}
    for item in related:
        row = clean_related(bill_id, item)
        related_rows[row["related_bill_id"]] = row
    with connect() as conn:
        for table in ("bill_cosponsors", "bill_committees", "related_bills"):
            # The table names are fixed above, never taken from input
            conn.execute(f"DELETE FROM {table} WHERE bill_id = %s", (bill_id,))
        conn.cursor().executemany(SAVE_COSPONSOR_SQL, list(cosponsor_rows.values()))
        conn.cursor().executemany(SAVE_COMMITTEE_SQL, clean_committees(bill_id, committees))
        conn.cursor().executemany(SAVE_RELATED_SQL, list(related_rows.values()))
        conn.execute(MARK_GRAPH_SYNCED_SQL, (bill_id,))


def sync_followed_graphs(client: CongressClient) -> int:
    """Refresh the edges of every followed bill that changed, and return how many were fetched."""
    fetched = 0
    for bill in followed_bills():
        if not graph_needs_refresh(bill):
            continue
        try:
            refresh_graph(client, bill["congress"], bill["type"], bill["number"])
            fetched += 1
        except httpx.HTTPError as error:
            # Left stale, so the next sync tries this bill again
            print(f"Cosponsors, committees or related bills for {bill['bill_id']} failed: {error}")
    return fetched
