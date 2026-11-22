from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException

from app.auth import current_uid
from app.db import connect, fetch_all
from app.models import BillType, CallEntry, CallIn
from app.sync.bills import make_bill_id

router = APIRouter(tags=["calls"])
Uid = Annotated[str, Depends(current_uid)]
CALL_PATH = "/bills/{congress}/{bill_type}/{number}/calls"


@router.get(CALL_PATH, response_model=list[CallEntry])
def list_calls(congress: int, bill_type: BillType, number: int, uid: Uid) -> list[dict[str, Any]]:
    """Return this account's most recent calls about the bill."""
    return fetch_all(
        """
        SELECT a.action_id, a.bioguide_id, m.name AS member_name, a.created_at
        FROM actions a JOIN members m USING (bioguide_id)
        WHERE a.uid = %s AND a.bill_id = %s AND a.action_type = 'call'
        ORDER BY a.created_at DESC, a.action_id DESC LIMIT 20
        """,
        (uid, make_bill_id(congress, bill_type, number)),
    )


@router.put(CALL_PATH + "/{request_id}", response_model=CallEntry)
def log_call(
    congress: int, bill_type: BillType, number: int, request_id: UUID, entry: CallIn, uid: Uid
) -> dict[str, Any]:
    """Record an office call about a bill and return the same entry for a retry."""
    bill_id = make_bill_id(congress, bill_type, number)
    with connect() as conn:
        found = conn.execute(
            """
            SELECT EXISTS (SELECT 1 FROM bills WHERE bill_id = %(bill_id)s) AS bill_found,
                   EXISTS (SELECT 1 FROM users WHERE uid = %(uid)s) AS user_found,
                   (SELECT name FROM members WHERE bioguide_id = %(member)s) AS member_name
            """,
            {"uid": uid, "bill_id": bill_id, "member": entry.bioguide_id},
        ).fetchone()
        if not found["bill_found"]:
            raise HTTPException(404, "Bill not found")
        if not found["user_found"]:
            raise HTTPException(403, "Finish signing up before logging a call")
        if found["member_name"] is None:
            raise HTTPException(404, "Representative not found")

        # A retry can arrive while the first request is still committing.
        row = conn.execute(
            """
            INSERT INTO actions (uid, bill_id, bioguide_id, action_type, request_id)
            VALUES (%s, %s, %s, 'call', %s)
            ON CONFLICT (uid, request_id) DO UPDATE SET request_id = EXCLUDED.request_id
            WHERE actions.bill_id = EXCLUDED.bill_id AND actions.bioguide_id = EXCLUDED.bioguide_id
              AND actions.action_type = 'call'
            RETURNING action_id, bioguide_id, created_at
            """,
            (uid, bill_id, entry.bioguide_id, request_id),
        ).fetchone()
        if row is None:
            raise HTTPException(409, "That request ID belongs to a different call")
        return {**row, "member_name": found["member_name"]}
