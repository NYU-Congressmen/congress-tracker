import re
from typing import Annotated, Any

from fastapi import APIRouter, HTTPException, Query

from app.db import fetch_all, fetch_one
from app.models import BillPage, Issue

router = APIRouter(tags=["feed"])


def keyword_pattern(keywords: list[str]) -> str:
    """Return a PostgreSQL pattern matching any keyword as whole words."""
    # Whole words keep a short keyword like AI from matching inside words like said
    return r"\y(" + "|".join(re.escape(keyword) for keyword in keywords) + r")\y"


@router.get("/issues", response_model=list[Issue])
def list_issues() -> list[dict[str, Any]]:
    """Return the issues a person can choose, in alphabetical order."""
    return fetch_all("SELECT issue_id, name FROM issues ORDER BY name")


@router.get("/feed", response_model=BillPage)
def get_feed(
    issue_id: Annotated[list[int], Query(min_length=1)],
    page: Annotated[int, Query(ge=1)] = 1,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
) -> dict[str, Any]:
    """Return bills whose title or CRS summary mentions a chosen issue, newest action first."""
    issues = fetch_all(
        "SELECT issue_id, keywords FROM issues WHERE issue_id = ANY(%(ids)s)", {"ids": issue_id}
    )
    missing = set(issue_id) - {issue["issue_id"] for issue in issues}
    if missing:
        raise HTTPException(status_code=404, detail=f"Unknown issues: {sorted(missing)}")

    keywords = [keyword for issue in issues for keyword in issue["keywords"]]
    if not keywords:
        return {"total": 0, "page": page, "limit": limit, "data": []}
    where = """
        WHERE title ~* %(pattern)s OR EXISTS (
            SELECT 1 FROM bill_summaries s
            WHERE s.bill_id = bills.bill_id AND s.text ~* %(pattern)s
        )
    """
    params: dict[str, Any] = {"pattern": keyword_pattern(keywords)}
    total = fetch_one(f"SELECT count(*) AS n FROM bills {where}", params)["n"]
    bills = fetch_all(
        f"""
        SELECT bill_id, congress, type, number, title, status, passed_house, passed_senate,
               introduced_date, latest_action_date, latest_action_text
        FROM bills {where}
        ORDER BY latest_action_date DESC NULLS LAST, bill_id
        LIMIT %(limit)s OFFSET %(offset)s
        """,
        {**params, "limit": limit, "offset": (page - 1) * limit},
    )
    return {"total": total, "page": page, "limit": limit, "data": bills}
