from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException

from app.auth import current_uid
from app.db import connect, fetch_one
from app.models import BillType, Review, ReviewIn
from app.sync.bills import make_bill_id

router = APIRouter(tags=["reviews"])

# Every review route acts for the signed-in user, so each one asks sign-in for the UID
Uid = Annotated[str, Depends(current_uid)]

REVIEW_COLUMNS = "bill_id, stance, story, action_taken, consent_to_share, created_at, updated_at"

# A second review of the same bill replaces the first, so each user has one review per bill
SAVE_REVIEW_SQL = f"""
    INSERT INTO reviews (uid, bill_id, stance, story, action_taken, consent_to_share)
    VALUES (%(uid)s, %(bill_id)s, %(stance)s, %(story)s, %(action_taken)s,
            %(consent_to_share)s)
    ON CONFLICT (uid, bill_id) DO UPDATE SET
        stance = EXCLUDED.stance,
        story = EXCLUDED.story,
        action_taken = EXCLUDED.action_taken,
        consent_to_share = EXCLUDED.consent_to_share,
        updated_at = now()
    RETURNING {REVIEW_COLUMNS}
"""


@router.put("/bills/{congress}/{bill_type}/{number}/review", response_model=Review)
def save_review(
    congress: int, bill_type: BillType, number: int, review: ReviewIn, uid: Uid
) -> dict[str, Any]:
    """Create or replace the signed-in user's review of a bill and return it."""
    bill_id = make_bill_id(congress, bill_type, number)
    with connect() as conn:
        found = conn.execute(
            "SELECT EXISTS (SELECT 1 FROM bills WHERE bill_id = %s) AS bill_found, "
            "EXISTS (SELECT 1 FROM users WHERE uid = %s) AS user_found",
            (bill_id, uid),
        ).fetchone()
        if not found["bill_found"]:
            raise HTTPException(404, "Bill not found")
        if not found["user_found"]:
            raise HTTPException(403, "Finish signing up before reviewing a bill")
        params = {**review.model_dump(), "uid": uid, "bill_id": bill_id}
        return conn.execute(SAVE_REVIEW_SQL, params).fetchone()


@router.get("/bills/{congress}/{bill_type}/{number}/review", response_model=Review)
def get_review(congress: int, bill_type: BillType, number: int, uid: Uid) -> dict[str, Any]:
    """Return the signed-in user's review of a bill."""
    row = fetch_one(
        f"SELECT {REVIEW_COLUMNS} FROM reviews WHERE uid = %s AND bill_id = %s",
        (uid, make_bill_id(congress, bill_type, number)),
    )
    if row is None:
        raise HTTPException(404, "You have not reviewed this bill")
    return row
