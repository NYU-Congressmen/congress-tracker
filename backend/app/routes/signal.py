from datetime import UTC, datetime, timedelta
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException

from app.ai.briefs import BRIEF_INPUTS
from app.auth import current_uid
from app.db import fetch_all, fetch_one
from app.models import BillType, SignalPage
from app.sample_data import sees_sample_data
from app.sync.bills import make_bill_id

router = APIRouter(tags=["constituent signal"])
Uid = Annotated[str, Depends(current_uid)]

# The bill page previews a rolling week, so the panel is never empty early on a Monday.
WINDOW = timedelta(days=7)

# The reader's current House member and senators, in the order the panel lists them.
OFFICES_SQL = """
    SELECT m.bioguide_id, m.name, m.party, m.chamber, m.state, m.district
    FROM members m JOIN users u ON m.state = u.state
    WHERE u.uid = %(uid)s AND m.is_current
      AND (m.chamber = 'Senate' OR m.district IS NOT DISTINCT FROM u.district)
    ORDER BY m.chamber = 'Senate', m.name
"""


@router.get("/bills/{congress}/{bill_type}/{number}/signal", response_model=SignalPage)
def preview_signal(congress: int, bill_type: BillType, number: int, uid: Uid) -> dict[str, Any]:
    """Return the Constituent Signal each of the reader's offices would get for the past week.

    The counts follow the weekly brief's rules: consenting, cleared and visible reviews from the
    office's district or state, plus calls those constituents logged to that office. Sample
    activity counts only for a sample account, as in the stance counts.
    """
    bill_id = make_bill_id(congress, bill_type, number)
    if fetch_one("SELECT 1 FROM bills WHERE bill_id = %s", (bill_id,)) is None:
        raise HTTPException(404, "Bill not found")
    offices = fetch_all(OFFICES_SQL, {"uid": uid})
    ends = datetime.now(UTC)
    params = {
        "bill_id": bill_id,
        "week_start": None,
        "starts": ends - WINDOW,
        "ends": ends,
        "include_sample": sees_sample_data(uid),
        "offices": [office["bioguide_id"] for office in offices],
    }
    counts = {row["bioguide_id"]: row for row in fetch_all(BRIEF_INPUTS, params)} if offices else {}
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
        "window_end": ends,
        "includes_sample": params["include_sample"],
        "your_review": (
            "none"
            if own is None
            else "not_consented"
            if not own["consent_to_share"]
            else "included"
            if own["in_window"] and offices
            else "not_included"
        ),
        "offices": [
            {
                **office,
                "support": counts.get(office["bioguide_id"], {}).get("support_count", 0),
                "oppose": counts.get(office["bioguide_id"], {}).get("oppose_count", 0),
                "unsure": counts.get(office["bioguide_id"], {}).get("unsure_count", 0),
                "calls": counts.get(office["bioguide_id"], {}).get("action_count", 0),
            }
            for office in offices
        ],
    }
