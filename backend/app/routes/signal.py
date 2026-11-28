from datetime import UTC, datetime, timedelta
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException

from app.ai.briefs import BRIEF_INPUTS
from app.auth import current_uid, optional_uid
from app.db import fetch_all, fetch_one
from app.models import BillType, MemberSignal, SignalPage
from app.sample_data import sees_sample_data
from app.sync.bills import make_bill_id

router = APIRouter(tags=["constituent signal"])
Uid = Annotated[str, Depends(current_uid)]
Viewer = Annotated[str | None, Depends(optional_uid)]

# The pages show a rolling week, so they are never empty early on a Monday.
WINDOW = timedelta(days=7)

# Counts appear only once this many constituents are counted for a bill and office, so a
# small total cannot point to one person.
MIN_COUNTED = 5

# The reader's current House member and senators, in the order the bill page lists them.
OFFICES_SQL = """
    SELECT m.bioguide_id, m.name, m.party, m.chamber, m.state, m.district
    FROM members m JOIN users u ON m.state = u.state
    WHERE u.uid = %(uid)s AND m.is_current
      AND (m.chamber = 'Senate' OR m.district IS NOT DISTINCT FROM u.district)
    ORDER BY m.chamber = 'Senate', m.name
"""


def window_params(viewer: str | None, **filters: Any) -> dict[str, Any]:
    """Return the brief query's parameters for the past seven days as this viewer sees them."""
    ends = datetime.now(UTC)
    return {
        "bill_id": None,
        "week_start": None,
        "starts": ends - WINDOW,
        "ends": ends,
        "include_sample": sees_sample_data(viewer),
        "offices": None,
        **filters,
    }


def published(row: dict[str, Any] | None) -> dict[str, Any]:
    """Return a row's counts, or nulls with withheld set when too few constituents are counted."""
    counts = {
        "support": row["support_count"] if row else 0,
        "oppose": row["oppose_count"] if row else 0,
        "unsure": row["unsure_count"] if row else 0,
        "calls": row["action_count"] if row else 0,
    }
    if counts["support"] + counts["oppose"] + counts["unsure"] < MIN_COUNTED:
        return {name: None for name in counts} | {"withheld": True}
    return counts | {"withheld": False}


@router.get("/bills/{congress}/{bill_type}/{number}/signal", response_model=SignalPage)
def preview_signal(congress: int, bill_type: BillType, number: int, uid: Uid) -> dict[str, Any]:
    """Return the Constituent Signal each of the reader's offices gets for a bill this week.

    The counts follow the weekly brief's rules: consenting, cleared and visible reviews from the
    office's district or state, plus calls those constituents logged to that office. Sample
    activity counts only for a sample account, as in the stance counts.
    """
    bill_id = make_bill_id(congress, bill_type, number)
    if fetch_one("SELECT 1 FROM bills WHERE bill_id = %s", (bill_id,)) is None:
        raise HTTPException(404, "Bill not found")
    offices = fetch_all(OFFICES_SQL, {"uid": uid})
    params = window_params(
        uid, bill_id=bill_id, offices=[office["bioguide_id"] for office in offices]
    )
    rows = {row["bioguide_id"]: row for row in fetch_all(BRIEF_INPUTS, params)} if offices else {}
    own = fetch_one(
        """
        SELECT r.consent_to_share,
               v.review_id IS NOT NULL AND r.updated_at >= %(starts)s AS in_window
        FROM reviews r LEFT JOIN visible_reviews v USING (review_id)
        WHERE r.uid = %(uid)s AND r.bill_id = %(bill_id)s
        """,
        {**params, "uid": uid},
    )
    return {
        "window_start": params["starts"],
        "window_end": params["ends"],
        "includes_sample": params["include_sample"],
        "min_counted": MIN_COUNTED,
        "your_review": (
            "none"
            if own is None
            else "not_consented"
            if not own["consent_to_share"]
            else "included"
            if own["in_window"] and offices
            else "not_included"
        ),
        "offices": [{**office, **published(rows.get(office["bioguide_id"]))} for office in offices],
    }


@router.get("/members/{bioguide_id}/signal", response_model=MemberSignal)
def member_signal(bioguide_id: str, viewer: Viewer) -> dict[str, Any]:
    """Return the public Constituent Signal one office received over the past week, by bill.

    Bills with fewer than the minimum number of counted constituents are only tallied, so the
    page shows that people spoke up without exposing a small group's stances.
    """
    if fetch_one("SELECT 1 FROM members WHERE bioguide_id = %s", (bioguide_id,)) is None:
        raise HTTPException(404, "Member not found")
    params = window_params(viewer, offices=[bioguide_id])
    bills, withheld = [], 0
    for row in fetch_all(BRIEF_INPUTS, params):
        counts = published(row)
        if counts["withheld"]:
            withheld += 1
            continue
        bills.append(
            {name: row[name] for name in ("bill_id", "congress", "type", "number", "title")}
            | counts
        )
    bills.sort(key=lambda bill: bill["support"] + bill["oppose"] + bill["unsure"], reverse=True)
    return {
        "window_start": params["starts"],
        "window_end": params["ends"],
        "includes_sample": params["include_sample"],
        "min_counted": MIN_COUNTED,
        "bills": bills,
        "withheld_bills": withheld,
    }
