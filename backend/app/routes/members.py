from typing import Any

from fastapi import APIRouter

from app.db import fetch_all

router = APIRouter(tags=["members"])


@router.get("/members")
def list_members(
    state: str | None = None, party: str | None = None, chamber: str | None = None
) -> dict[str, Any]:
    # List current members of Congress, optionally filtered by state, party and chamber.
    sql = "SELECT * FROM members WHERE true"
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
