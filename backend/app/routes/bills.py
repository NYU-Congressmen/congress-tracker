import difflib
from datetime import date
from typing import Annotated, Any

import httpx
from fastapi import APIRouter, HTTPException, Query

from app.config import settings
from app.db import fetch_all, fetch_one
from app.models import BillDetail, BillDiff, BillPage, BillType, Status, TextVersion
from app.sync.bills import make_bill_id
from app.sync.cache import (
    REFRESH_BUDGET,
    bill_needs_refresh,
    recently_not_found,
    record_failure,
    record_not_found,
    refresh_bill,
    retry_allowed,
)
from app.sync.client import CongressClient
from app.sync.texts import load_text

router = APIRouter(tags=["bills"])


@router.get("/bills", response_model=BillPage)
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
        SELECT bill_id, congress, type, number, title, status, passed_house, passed_senate,
               introduced_date,
               latest_action_date, latest_action_text
        FROM bills {where}
        ORDER BY latest_action_date DESC NULLS LAST, bill_id
        LIMIT %(limit)s OFFSET %(offset)s
        """,
        {**params, "limit": limit, "offset": (page - 1) * limit},
    )
    return {"total": total, "page": page, "limit": limit, "data": bills}


@router.get("/bills/{congress}/{bill_type}/{number}", response_model=BillDetail)
def get_bill(congress: int, bill_type: BillType, number: int) -> dict[str, Any]:
    """Return one bill with its sponsor and actions, refreshing them when the cache is stale.

    When Congress.gov cannot be reached, the cached copy is returned as it stands.
    """
    bill_id = make_bill_id(congress, bill_type, number)
    row = fetch_one("SELECT * FROM bills WHERE bill_id = %s", (bill_id,))
    if row is None and recently_not_found(bill_id):
        raise HTTPException(404, "Bill not found")
    can_retry = row is None or retry_allowed(row["details_retry_after"])
    if bill_needs_refresh(row) and settings.congress_api_key and can_retry:
        try:
            with CongressClient(settings.congress_api_key, budget=REFRESH_BUDGET) as client:
                refresh_bill(client, congress, bill_type, number)
        except httpx.HTTPError as error:
            if row is None:
                response = getattr(error, "response", None)
                missing = response is not None and response.status_code == 404
                if missing:
                    record_not_found(bill_id)
                raise HTTPException(
                    404 if missing else 502,
                    "Bill not found" if missing else "Congress.gov could not be reached",
                ) from error
            record_failure("bill", bill_id)
        row = fetch_one("SELECT * FROM bills WHERE bill_id = %s", (bill_id,))
    if row is None:
        raise HTTPException(404, "Bill not found")

    sponsor = None
    if row["sponsor_id"]:
        sponsor = fetch_one(
            "SELECT * FROM members WHERE bioguide_id = %s",
            (row["sponsor_id"],),
        )
    actions = fetch_all(
        "SELECT action_date, type, text FROM bill_actions WHERE bill_id = %s ORDER BY id ASC",
        (bill_id,),
    )
    cache = {
        "complete": row["details_synced_at"] is not None,
        "stale": bill_needs_refresh(row),
        "refreshed_at": row["details_synced_at"],
        "refresh_failed": row["details_retry_after"] is not None,
        "retry_after": row["details_retry_after"],
    }
    return {**row, "sponsor": sponsor, "actions": actions, "cache": cache}


@router.get("/bills/{congress}/{bill_type}/{number}/texts", response_model=list[TextVersion])
def list_text_versions(congress: int, bill_type: BillType, number: int) -> list[dict[str, Any]]:
    """Return a bill's stored text versions, oldest first. Opening the bill stores them."""
    return fetch_all(
        """
        SELECT version_type, version_date, text_url, pdf_url, text IS NOT NULL AS downloaded
        FROM text_versions WHERE bill_id = %s
        ORDER BY version_date ASC NULLS LAST, version_type
        """,
        (make_bill_id(congress, bill_type, number),),
    )


@router.get("/bills/{congress}/{bill_type}/{number}/diff", response_model=BillDiff)
def diff_text_versions(
    congress: int,
    bill_type: BillType,
    number: int,
    from_: Annotated[str, Query(alias="from")],
    to: str,
) -> dict[str, Any]:
    """Return the changes between two text versions, downloading either text not yet stored."""
    bill_id = make_bill_id(congress, bill_type, number)
    try:
        old, new = load_text(bill_id, from_), load_text(bill_id, to)
    except LookupError as error:
        raise HTTPException(404, str(error)) from error
    except httpx.HTTPError as error:
        raise HTTPException(502, "The bill text could not be downloaded") from error
    if old is None or new is None:
        raise HTTPException(404, "One of these versions has no formatted text to compare")
    changes = difflib.unified_diff(
        old.splitlines(), new.splitlines(), fromfile=from_, tofile=to, lineterm=""
    )
    return {"from_version": from_, "to_version": to, "changes": list(changes)}
