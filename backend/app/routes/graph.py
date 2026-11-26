from typing import Any

import httpx
from fastapi import APIRouter, HTTPException

from app.config import settings
from app.db import fetch_all, fetch_one
from app.models import BillGraph, BillType
from app.sync.bills import make_bill_id
from app.sync.cache import REFRESH_BUDGET, record_failure, retry_allowed
from app.sync.client import CongressClient
from app.sync.graph import graph_needs_refresh, refresh_graph

router = APIRouter(tags=["bills"])

GRAPH_STATE_SQL = """
    SELECT bill_id, update_date, graph_synced_at, graph_update_date, graph_retry_after
    FROM bills WHERE bill_id = %s
"""


@router.get("/bills/{congress}/{bill_type}/{number}/graph", response_model=BillGraph)
def get_graph(congress: int, bill_type: BillType, number: int) -> dict[str, Any]:
    """Return a bill's cosponsors, committees and related bills, fetching them when stale.

    When Congress.gov cannot be reached, the stored edges are returned as they stand.
    """
    bill_id = make_bill_id(congress, bill_type, number)
    row = fetch_one(GRAPH_STATE_SQL, (bill_id,))
    if row is None:
        raise HTTPException(404, "Bill not found")
    if (
        graph_needs_refresh(row)
        and settings.congress_api_key
        and retry_allowed(row["graph_retry_after"])
    ):
        try:
            with CongressClient(settings.congress_api_key, budget=REFRESH_BUDGET) as client:
                refresh_graph(client, congress, bill_type, number)
        except httpx.HTTPError:
            record_failure("graph", bill_id)
        row = fetch_one(GRAPH_STATE_SQL, (bill_id,))

    cosponsors = fetch_all(
        """
        SELECT bioguide_id, name, party, state, district, sponsorship_date, is_original,
               withdrawn_date
        FROM bill_cosponsors WHERE bill_id = %s
        ORDER BY withdrawn_date IS NOT NULL, is_original DESC, sponsorship_date, name
        """,
        (bill_id,),
    )
    committees = fetch_all(
        """
        SELECT system_code, name, chamber, type, parent_code, latest_activity,
               latest_activity_date
        FROM bill_committees WHERE bill_id = %s
        ORDER BY COALESCE(parent_code, system_code), parent_code IS NOT NULL, system_code
        """,
        (bill_id,),
    )
    related = fetch_all(
        """
        SELECT r.related_bill_id AS bill_id, r.congress, r.type, r.number, r.title,
               r.relationship, r.identified_by, r.latest_action_date, r.latest_action_text,
               EXISTS (SELECT 1 FROM bills b WHERE b.bill_id = r.related_bill_id) AS stored
        FROM related_bills r WHERE r.bill_id = %s
        ORDER BY r.congress DESC, r.type, r.number
        """,
        (bill_id,),
    )
    cache = {
        "complete": row["graph_synced_at"] is not None,
        "stale": graph_needs_refresh(row),
        "refreshed_at": row["graph_synced_at"],
        "refresh_failed": row["graph_retry_after"] is not None,
        "retry_after": row["graph_retry_after"],
    }
    return {
        "bill_id": bill_id,
        "cosponsors": cosponsors,
        "committees": committees,
        "related_bills": related,
        "cache": cache,
    }
