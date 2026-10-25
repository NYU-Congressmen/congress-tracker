from datetime import date
from typing import Annotated, Any, Literal

import httpx
from fastapi import APIRouter, HTTPException, Query

from app.config import settings
from app.db import fetch_all, fetch_one
from app.sync.bills import make_bill_id
from app.sync.cache import bill_needs_refresh, refresh_bill
from app.sync.client import CongressClient
from app.sync.status import STAGES

router = APIRouter(tags=["bills"])

BillType = Literal["hr", "s", "hjres", "sjres", "hconres", "sconres", "hres", "sres"]
Status = Literal[STAGES]


@router.get("/bills")
def search_bills(
    q: str | None = None,
    status: Status | None = None,
    from_: Annotated[date | None, Query(alias="from")] = None,
    to: date | None = None,
    page: Annotated[int, Query(ge=1)] = 1,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
) -> dict[str, Any]:
    """Search bills by title keyword, status and introduced-date range, newest action first."""
    where = "WHERE true"
    params: dict[str, Any] = {}
    if q:
        where += " AND title ILIKE %(q)s"
        params["q"] = f"%{q}%"
    if status:
        where += " AND status = %(status)s"
        params["status"] = status
    if from_:
        where += " AND introduced_date >= %(from_)s"
        params["from_"] = from_
    if to:
        where += " AND introduced_date <= %(to)s"
        params["to"] = to

    total = fetch_one(f"SELECT count(*) AS n FROM bills {where}", params)["n"]
    bills = fetch_all(
        f"""
        SELECT bill_id, type, number, title, status, introduced_date,
               latest_action_date, latest_action_text
        FROM bills {where}
        ORDER BY latest_action_date DESC NULLS LAST
        LIMIT %(limit)s OFFSET %(offset)s
        """,
        {**params, "limit": limit, "offset": (page - 1) * limit},
    )
    return {"total": total, "page": page, "limit": limit, "data": bills}


@router.get("/bills/{congress}/{bill_type}/{number}")
def get_bill(congress: int, bill_type: BillType, number: int) -> dict[str, Any]:
    """Return one bill with its sponsor and actions, refreshing them when the cache is stale.

    When Congress.gov cannot be reached, the cached copy is returned as it stands.
    """
    bill_id = make_bill_id(congress, bill_type, number)
    row = fetch_one("SELECT * FROM bills WHERE bill_id = %s", (bill_id,))
    if bill_needs_refresh(row) and settings.congress_api_key:
        try:
            with CongressClient(settings.congress_api_key) as client:
                refresh_bill(client, congress, bill_type, number)
        except httpx.HTTPError as error:
            if row is None:
                response = getattr(error, "response", None)
                missing = response is not None and response.status_code == 404
                raise HTTPException(
                    404 if missing else 502,
                    "Bill not found" if missing else "Congress.gov could not be reached",
                ) from error
        row = fetch_one("SELECT * FROM bills WHERE bill_id = %s", (bill_id,))
    if row is None:
        raise HTTPException(404, "Bill not found")

    sponsor = None
    if row["sponsor_id"]:
        sponsor = fetch_one(
            "SELECT bioguide_id, name, party, state, chamber, district FROM members"
            " WHERE bioguide_id = %s",
            (row["sponsor_id"],),
        )
    actions = fetch_all(
        "SELECT action_date, type, text FROM bill_actions WHERE bill_id = %s"
        " ORDER BY action_date DESC NULLS LAST, id DESC",
        (bill_id,),
    )
    return {**row, "sponsor": sponsor, "actions": actions}
