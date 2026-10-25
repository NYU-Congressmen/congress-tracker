from datetime import date
from typing import Annotated, Any

from fastapi import APIRouter, Query

from app.db import fetch_all, fetch_one

router = APIRouter(tags=["bills"])


@router.get("/bills")
def search_bills(
    q: str | None = None,
    status: str | None = None,
    from_: Annotated[date | None, Query(alias="from")] = None,
    to: date | None = None,
    page: Annotated[int, Query(ge=1)] = 1,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
) -> dict[str, Any]:
    # Search bills by keyword in the title, status and introduced-date range, newest first.
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
