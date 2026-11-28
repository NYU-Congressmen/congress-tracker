import re
from datetime import date
from typing import Annotated, Any, get_args

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query

from app.ai.diff_summary import summary_for_diff
from app.auth import current_uid
from app.config import settings
from app.db import fetch_all, fetch_one
from app.models import BillDetail, BillDiff, BillPage, BillText, BillType, Status, TextVersion
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
from app.sync.texts import compare_versions, load_text, refresh_text_versions

router = APIRouter(tags=["bills"])


def bill_search_reference(query: str) -> tuple[str | None, str | None, int] | None:
    """Parse a bill number, a bill type and number, or a stored bill ID."""
    match = re.fullmatch(
        r"(?:(?:([0-9]{1,3})-)?([a-z. ]*[a-z.])[ -]*)?([0-9]{1,10})", query.lower()
    )
    if not match:
        return None
    congress, bill_type, digits = match.groups()
    bill_type = re.sub(r"[. ]", "", bill_type) if bill_type else None
    number = int(digits)
    if number > 2_147_483_647 or (bill_type is not None and bill_type not in get_args(BillType)):
        return None
    return congress, bill_type, number


@router.get("/bills", response_model=BillPage)
def search_bills(
    q: str | None = None,
    status: Status | None = None,
    from_: Annotated[date | None, Query(alias="from")] = None,
    to: date | None = None,
    page: Annotated[int, Query(ge=1)] = 1,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
) -> dict[str, Any]:
    """Search bills by title or bill number, with optional stage and introduced-date filters."""
    where = "WHERE true"
    params: dict[str, Any] = {}
    if q and (query := q.strip()):
        params["q"] = f"%{query}%"
        reference = bill_search_reference(query)
        if reference is None:
            where += " AND title ILIKE %(q)s"
        else:
            congress, bill_type, number = reference
            if congress is not None and bill_type is not None:
                where += " AND (title ILIKE %(q)s OR bill_id = %(bill_id)s)"
                params["bill_id"] = make_bill_id(int(congress), bill_type, number)
            elif bill_type is not None:
                where += " AND (title ILIKE %(q)s OR (type = %(type)s AND number = %(number)s))"
                params.update(type=bill_type, number=number)
            else:
                where += " AND (title ILIKE %(q)s OR number = %(number)s)"
                params["number"] = number
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


@router.get("/bills/stage-counts", response_model=dict[Status, int])
def stage_counts() -> dict[str, int]:
    """Return how many bills sit at each stage, with zero for a stage that has none."""
    counts = {
        row["status"]: row["n"]
        for row in fetch_all("SELECT status, count(*) AS n FROM bills GROUP BY status")
    }
    return {status: counts.get(status, 0) for status in get_args(Status)}


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


def ensure_text_versions(congress: int, bill_type: BillType, number: int) -> None:
    """Fetch a stored bill's text versions when none are saved yet.

    Bills that were never opened, or were cached before versions were stored, have none. A failed
    fetch leaves the list empty and starts the bill's retry cooldown.
    """
    bill_id = make_bill_id(congress, bill_type, number)
    row = fetch_one(
        """
        SELECT details_retry_after,
               EXISTS (SELECT 1 FROM text_versions t WHERE t.bill_id = bills.bill_id) AS stored
        FROM bills WHERE bill_id = %s
        """,
        (bill_id,),
    )
    if row is None:
        raise HTTPException(404, "Bill not found")
    if row["stored"] or not settings.congress_api_key:
        return
    if not retry_allowed(row["details_retry_after"]):
        return
    try:
        with CongressClient(settings.congress_api_key, budget=REFRESH_BUDGET) as client:
            refresh_text_versions(client, bill_id, congress, bill_type, number)
    except httpx.HTTPError:
        record_failure("bill", bill_id)


@router.get("/bills/{congress}/{bill_type}/{number}/texts", response_model=list[TextVersion])
def list_text_versions(congress: int, bill_type: BillType, number: int) -> list[dict[str, Any]]:
    """Return a bill's text versions, oldest first, fetching the list if none is stored yet."""
    ensure_text_versions(congress, bill_type, number)
    return fetch_all(
        """
        SELECT version_type, version_date, text_url, pdf_url, text IS NOT NULL AS downloaded
        FROM text_versions WHERE bill_id = %s
        ORDER BY version_date ASC NULLS LAST, version_type
        """,
        (make_bill_id(congress, bill_type, number),),
    )


@router.get("/bills/{congress}/{bill_type}/{number}/texts/content", response_model=BillText)
def read_text_version(congress: int, bill_type: BillType, number: int, version: str) -> BillText:
    """Return the full formatted text of one published bill version."""
    bill_id = make_bill_id(congress, bill_type, number)
    ensure_text_versions(congress, bill_type, number)
    try:
        text = load_text(bill_id, version)
    except LookupError as error:
        raise HTTPException(404, str(error)) from error
    except httpx.HTTPError as error:
        raise HTTPException(502, "The bill text could not be downloaded") from error
    if text is None:
        raise HTTPException(404, "This version has no formatted text")
    return BillText(version_type=version, text=text)


def bill_version_diff(
    congress: int,
    bill_type: BillType,
    number: int,
    from_: str,
    to: str,
    *,
    uid: str | None = None,
    full_text: bool = False,
) -> BillDiff:
    """Return a comparison with its saved summary, generating one for a signed-in reader."""
    bill_id = make_bill_id(congress, bill_type, number)
    ensure_text_versions(congress, bill_type, number)
    try:
        changes = compare_versions(bill_id, from_, to, full_text=full_text)
    except LookupError as error:
        raise HTTPException(404, str(error)) from error
    except httpx.HTTPError as error:
        raise HTTPException(502, "The bill text could not be downloaded") from error
    return BillDiff(
        from_version=from_,
        to_version=to,
        changes=changes,
        summary=None if full_text else summary_for_diff(bill_id, changes, uid=uid),
    )


@router.get("/bills/{congress}/{bill_type}/{number}/diff", response_model=BillDiff)
def diff_text_versions(
    congress: int,
    bill_type: BillType,
    number: int,
    from_: Annotated[str, Query(alias="from")],
    to: str,
    full_text: bool = False,
) -> BillDiff:
    """Return a bill's text comparison as excerpts with a saved summary or as full text."""
    return bill_version_diff(congress, bill_type, number, from_, to, full_text=full_text)


@router.post("/bills/{congress}/{bill_type}/{number}/diff", response_model=BillDiff)
def summarize_text_versions(
    congress: int,
    bill_type: BillType,
    number: int,
    from_: Annotated[str, Query(alias="from")],
    to: str,
    uid: Annotated[str, Depends(current_uid)],
) -> BillDiff:
    """Return a bill's text comparison, generating a missing summary within daily limits."""
    return bill_version_diff(congress, bill_type, number, from_, to, uid=uid)
