from typing import Any

import httpx
from fastapi import APIRouter, HTTPException

from app.config import settings
from app.db import fetch_all, fetch_one
from app.models import MemberDetail, MemberList
from app.sync.bills import CONGRESS
from app.sync.cache import (
    REFRESH_BUDGET,
    record_failure,
    refresh_sponsored,
    retry_allowed,
    sponsored_needs_refresh,
)
from app.sync.client import CongressClient

router = APIRouter(tags=["members"])


@router.get("/members", response_model=MemberList)
def list_members(
    state: str | None = None, party: str | None = None, chamber: str | None = None
) -> dict[str, Any]:
    """List current members of Congress, optionally filtered by state, party and chamber."""
    sql = "SELECT * FROM members WHERE is_current"
    params: dict[str, str] = {}
    if state:
        sql += " AND state = %(state)s"
        params["state"] = state.upper()
    if party:
        sql += " AND party = %(party)s"
        params["party"] = party.upper()
    if chamber:
        sql += " AND chamber = %(chamber)s"
        params["chamber"] = chamber.capitalize()
    sql += " ORDER BY state, chamber, name"

    members = fetch_all(sql, params)
    return {"total": len(members), "data": members}


@router.get("/members/{bioguide_id}", response_model=MemberDetail)
def get_member(bioguide_id: str) -> dict[str, Any]:
    """Return one member with their current-Congress sponsored bills, refreshed daily.

    When Congress.gov cannot be reached, the cached sponsored bills are returned as they stand.
    """
    bioguide_id = bioguide_id.upper()
    member = fetch_one("SELECT * FROM members WHERE bioguide_id = %s", (bioguide_id,))
    if member is None:
        raise HTTPException(404, "Member not found")
    if (
        sponsored_needs_refresh(member)
        and settings.congress_api_key
        and retry_allowed(member["sponsored_retry_after"])
    ):
        try:
            with CongressClient(settings.congress_api_key, budget=REFRESH_BUDGET) as client:
                refresh_sponsored(client, bioguide_id)
        except httpx.HTTPError:
            record_failure("member", bioguide_id)
        member = fetch_one("SELECT * FROM members WHERE bioguide_id = %s", (bioguide_id,))

    bills = fetch_all(
        """
        SELECT bill_id, congress, type, number, title, status, passed_house, passed_senate,
               introduced_date, latest_action_date, latest_action_text
        FROM bills WHERE sponsor_id = %s AND congress = %s
        ORDER BY introduced_date DESC NULLS LAST, bill_id
        """,
        (bioguide_id, CONGRESS),
    )
    cache = {
        "complete": member["sponsored_synced_at"] is not None,
        "stale": sponsored_needs_refresh(member),
        "refreshed_at": member["sponsored_synced_at"],
        "refresh_failed": member["sponsored_retry_after"] is not None,
        "retry_after": member["sponsored_retry_after"],
    }
    return {**member, "sponsored_bills": bills, "cache": cache}
