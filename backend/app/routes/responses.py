from typing import Annotated, Any

from fastapi import APIRouter, HTTPException, Query

from app.db import fetch_all, fetch_one
from app.models import BillResponses, BillType
from app.sync.bills import make_bill_id

router = APIRouter(tags=["reviews"])

LABEL = "Verified Pull users who responded"


@router.get("/bills/{congress}/{bill_type}/{number}/responses", response_model=BillResponses)
def count_responses(
    congress: int,
    bill_type: BillType,
    number: int,
    state: Annotated[str | None, Query(pattern="^[A-Za-z]{2}$")] = None,
    district: Annotated[int | None, Query(ge=0)] = None,
) -> dict[str, Any]:
    """Count verified users' stances on a bill, optionally only those in one state or district.

    Every account is phone-verified, so these are counts of people who chose to respond, not a
    sample of the public. Reviews their authors hid are left out. An at-large seat has no
    district number, so its constituents are counted with the state filter alone.
    """
    if district is not None and state is None:
        raise HTTPException(422, "Filter by state as well as district.")
    bill_id = make_bill_id(congress, bill_type, number)
    if fetch_one("SELECT 1 FROM bills WHERE bill_id = %s", (bill_id,)) is None:
        raise HTTPException(404, "Bill not found")

    where = "r.bill_id = %(bill_id)s AND r.hidden_at IS NULL"
    params: dict[str, Any] = {"bill_id": bill_id}
    if state is not None:
        state = state.upper()
        where += " AND u.state = %(state)s"
        params["state"] = state
    if district is not None:
        where += " AND u.district = %(district)s"
        params["district"] = district
    rows = fetch_all(
        f"""
        SELECT r.stance, count(*) AS n
        FROM reviews r JOIN users u ON u.uid = r.uid
        WHERE {where}
        GROUP BY r.stance
        """,
        params,
    )

    counts = {"support": 0, "oppose": 0, "unsure": 0}
    counts.update({row["stance"]: row["n"] for row in rows})
    return {
        "bill_id": bill_id,
        "label": LABEL,
        "state": state,
        "district": district,
        "total": sum(counts.values()),
        "counts": counts,
    }
