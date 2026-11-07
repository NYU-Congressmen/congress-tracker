from datetime import UTC, datetime, timedelta
from typing import Any

from app.db import connect
from app.sync.bills import CONGRESS, clean_bill
from app.sync.client import CongressClient
from app.sync.members import SAVE_MEMBER_SQL, clean_member_detail
from app.sync.status import NEVER_DOWNGRADE_SQL, summarize_actions
from app.sync.texts import SAVE_VERSION_SQL, clean_version

# Sponsorship has no update date to compare against, so it is refreshed on a schedule
SPONSORED_MAX_AGE = timedelta(days=1)
REFRESH_BUDGET = 5.0
RETRY_DELAY = timedelta(minutes=1)

# Bills Congress.gov reported missing, remembered per process so repeats spend no quota
NOT_FOUND_DELAY = timedelta(minutes=10)
NOT_FOUND_LIMIT = 10_000
_not_found: dict[str, datetime] = {}

SAVE_DETAIL_SQL = f"""
    INSERT INTO bills (bill_id, congress, type, number, title, policy_area, sponsor_id, status,
                       introduced_date, latest_action_date, latest_action_text, update_date,
                       details_synced_at, details_update_date, passed_house, passed_senate)
    VALUES (%(bill_id)s, %(congress)s, %(type)s, %(number)s, %(title)s, %(policy_area)s,
            %(sponsor_id)s, %(status)s, %(introduced_date)s, %(latest_action_date)s,
            %(latest_action_text)s, %(update_date)s, now(), %(update_date)s,
            %(passed_house)s, %(passed_senate)s)
    ON CONFLICT (bill_id) DO UPDATE SET
        title = EXCLUDED.title,
        policy_area = EXCLUDED.policy_area,
        sponsor_id = EXCLUDED.sponsor_id,
        status = {NEVER_DOWNGRADE_SQL},
        passed_house = bills.passed_house OR EXCLUDED.passed_house,
        passed_senate = bills.passed_senate OR EXCLUDED.passed_senate,
        introduced_date = EXCLUDED.introduced_date,
        latest_action_date = EXCLUDED.latest_action_date,
        latest_action_text = EXCLUDED.latest_action_text,
        update_date = GREATEST(bills.update_date, EXCLUDED.update_date),
        details_update_date = EXCLUDED.details_update_date,
        details_synced_at = now(),
        details_retry_after = NULL
"""

SAVE_ACTION_SQL = """
    INSERT INTO bill_actions (bill_id, action_date, type, text)
    VALUES (%(bill_id)s, %(action_date)s, %(type)s, %(text)s)
"""

SAVE_SPONSORED_SQL = f"""
    INSERT INTO bills (bill_id, congress, type, number, title, status, introduced_date,
                       latest_action_date, latest_action_text, sponsor_id,
                       passed_house, passed_senate)
    VALUES (%(bill_id)s, %(congress)s, %(type)s, %(number)s, %(title)s, %(status)s,
            %(introduced_date)s, %(latest_action_date)s, %(latest_action_text)s, %(sponsor_id)s,
            %(passed_house)s, %(passed_senate)s)
    ON CONFLICT (bill_id) DO UPDATE SET
        sponsor_id = EXCLUDED.sponsor_id,
        status = {NEVER_DOWNGRADE_SQL},
        passed_house = bills.passed_house OR EXCLUDED.passed_house,
        passed_senate = bills.passed_senate OR EXCLUDED.passed_senate,
        introduced_date = COALESCE(bills.introduced_date, EXCLUDED.introduced_date)
"""


def bill_needs_refresh(row: dict[str, Any] | None) -> bool:
    """Return whether a cached bill is missing its details or changed after they were fetched."""
    if row is None or row["details_synced_at"] is None:
        return True
    version = row["details_update_date"]
    return row["update_date"] is not None and (version is None or row["update_date"] > version)


def sponsored_needs_refresh(member: dict[str, Any]) -> bool:
    """Return whether a member's sponsored bills were never cached or are older than a day."""
    synced = member["sponsored_synced_at"]
    return synced is None or datetime.now(UTC) - synced > SPONSORED_MAX_AGE


def retry_allowed(retry_after: datetime | None) -> bool:
    """Return whether the retry cooldown has ended or no refresh has failed."""
    return retry_after is None or retry_after <= datetime.now(UTC)


def record_failure(resource: str, identifier: str) -> None:
    """Delay another refresh of a cached bill or member for one minute."""
    # Only these fixed queries are accepted so identifiers never become SQL syntax.
    queries = {
        "bill": "UPDATE bills SET details_retry_after = %s WHERE bill_id = %s",
        "member": "UPDATE members SET sponsored_retry_after = %s WHERE bioguide_id = %s",
    }
    with connect() as conn:
        conn.execute(queries[resource], (datetime.now(UTC) + RETRY_DELAY, identifier))


def recently_not_found(bill_id: str) -> bool:
    """Return whether Congress.gov reported this bill missing within the last ten minutes."""
    until = _not_found.get(bill_id)
    if until is not None and until > datetime.now(UTC):
        return True
    _not_found.pop(bill_id, None)
    return False


def record_not_found(bill_id: str) -> None:
    """Remember for ten minutes that Congress.gov has no bill with this id."""
    # A flood of invented ids could otherwise grow the dictionary without limit
    if len(_not_found) >= NOT_FOUND_LIMIT:
        _not_found.clear()
    _not_found[bill_id] = datetime.now(UTC) + NOT_FOUND_DELAY


def refresh_bill(client: CongressClient, congress: int, bill_type: str, number: int) -> str:
    """Fetch a bill's detail and actions from Congress.gov, cache them and return its bill_id."""
    path = f"/bill/{congress}/{bill_type}/{number}"
    detail = client.get(path)["bill"]
    actions = list(client.paginate(f"{path}/actions", "actions"))
    versions = client.get(f"{path}/text").get("textVersions", [])

    row = clean_bill(detail)
    row["policy_area"] = (detail.get("policyArea") or {}).get("name")
    sponsors = detail.get("sponsors") or []
    row["sponsor_id"] = sponsors[0]["bioguideId"] if sponsors else None
    row.update(summarize_actions([detail.get("latestAction") or {}, *actions], bill_type))

    # Finish all upstream calls before opening the transaction that replaces the cache.
    sponsor = None
    if row["sponsor_id"]:
        with connect() as conn:
            exists = conn.execute(
                "SELECT 1 FROM members WHERE bioguide_id = %s", (row["sponsor_id"],)
            ).fetchone()
        if not exists:
            sponsor = clean_member_detail(client.get(f"/member/{row['sponsor_id']}")["member"])

    # One transaction, so a failure part way leaves the previous cache intact
    with connect() as conn:
        if sponsor:
            conn.execute(SAVE_MEMBER_SQL, sponsor)
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
        conn.cursor().executemany(
            SAVE_VERSION_SQL, [clean_version(row["bill_id"], v) for v in versions]
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
            "UPDATE members SET sponsored_synced_at = now(), sponsored_retry_after = NULL"
            " WHERE bioguide_id = %s",
            (bioguide_id,),
        )
    return len(rows)
