from typing import Any

import httpx
from fastapi import APIRouter, HTTPException

from app.config import settings
from app.db import fetch_all, fetch_one
from app.sync.cache import refresh_sponsored, sponsored_needs_refresh
from app.sync.client import CongressClient

router = APIRouter(tags=["members"])


@router.get("/members")
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


@router.get("/members/{bioguide_id}")
def get_member(bioguide_id: str) -> dict[str, Any]:
    """Return one member with their current-Congress sponsored bills, refreshed daily.

    When Congress.gov cannot be reached, the cached sponsored bills are returned as they stand.
    """
    bioguide_id = bioguide_id.upper()
    member = fetch_one("SELECT * FROM members WHERE bioguide_id = %s", (bioguide_id,))
    if member is None:
        raise HTTPException(404, "Member not found")
    if sponsored_needs_refresh(member) and settings.congress_api_key:
        try:
            with CongressClient(settings.congress_api_key) as client:
                refresh_sponsored(client, bioguide_id)
            member = fetch_one("SELECT * FROM members WHERE bioguide_id = %s", (bioguide_id,))
        except httpx.HTTPError:
            pass

    bills = fetch_all(
        """
        SELECT bill_id, type, number, title, status, introduced_date, latest_action_date
        FROM bills WHERE sponsor_id = %s
        ORDER BY introduced_date DESC NULLS LAST
        """,
        (bioguide_id,),
    )
    return {**member, "sponsored_bills": bills}
