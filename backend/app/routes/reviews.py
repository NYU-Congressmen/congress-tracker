from typing import Annotated, Any

from fastapi import APIRouter, Body, Depends, HTTPException, Query, Response
from psycopg import Connection

from app.auth import current_uid, optional_uid
from app.db import connect, fetch_all, fetch_one
from app.models import BillType, ReportIn, Review, ReviewIn, ReviewPage, ReviewVisibility, Stance
from app.sync.bills import make_bill_id

router = APIRouter(tags=["reviews"])

# Routes that act for a user ask sign-in for the UID
Uid = Annotated[str, Depends(current_uid)]

REVIEW_COLUMNS = (
    "bill_id, stance, story, action_taken, consent_to_share, share_publicly, created_at, "
    "updated_at, hidden_at IS NOT NULL AS hidden"
)

# Reports from this many different signed-in people withhold a review until the team looks.
# Visitors' reports are recorded too, but one person could send any number of them.
WITHHOLD_AFTER_REPORTS = 3

# A review is shared when its author chose to list it publicly, has not hidden it and reports
# have not withheld it. Consent to the office brief (consent_to_share) is a separate choice.
SHARED_REVIEW_SQL = f"""
    r.share_publicly AND r.hidden_at IS NULL
    AND (SELECT count(*) FROM review_reports rr
         WHERE rr.review_id = r.review_id
           AND rr.reporter_uid IS NOT NULL AND rr.dismissed_at IS NULL)
        < {WITHHOLD_AFTER_REPORTS}
"""

# A second review of the same bill replaces the first, so each user has one review per bill
SAVE_REVIEW_SQL = f"""
    INSERT INTO reviews (uid, bill_id, stance, story, action_taken, consent_to_share,
                         share_publicly)
    VALUES (%(uid)s, %(bill_id)s, %(stance)s, %(story)s, %(action_taken)s,
            %(consent_to_share)s, %(share_publicly)s)
    ON CONFLICT (uid, bill_id) DO UPDATE SET
        stance = EXCLUDED.stance,
        story = EXCLUDED.story,
        action_taken = EXCLUDED.action_taken,
        consent_to_share = EXCLUDED.consent_to_share,
        share_publicly = EXCLUDED.share_publicly,
        updated_at = now()
    RETURNING {REVIEW_COLUMNS}
"""


def check_review_target(conn: Connection, bill_id: str, uid: str) -> None:
    """Check that the bill and signed-in account exist before writing a review."""
    found = conn.execute(
        "SELECT EXISTS (SELECT 1 FROM bills WHERE bill_id = %s) AS bill_found, "
        "EXISTS (SELECT 1 FROM users WHERE uid = %s) AS user_found",
        (bill_id, uid),
    ).fetchone()
    if not found["bill_found"]:
        raise HTTPException(404, "Bill not found")
    if not found["user_found"]:
        raise HTTPException(403, "Finish signing up before reviewing a bill")


@router.put("/bills/{congress}/{bill_type}/{number}/review", response_model=Review)
def save_review(
    congress: int, bill_type: BillType, number: int, review: ReviewIn, uid: Uid
) -> dict[str, Any]:
    """Create or replace the signed-in user's review of a bill and return it."""
    bill_id = make_bill_id(congress, bill_type, number)
    with connect() as conn:
        check_review_target(conn, bill_id, uid)
        params = {**review.model_dump(), "uid": uid, "bill_id": bill_id}
        return conn.execute(SAVE_REVIEW_SQL, params).fetchone()


@router.put("/bills/{congress}/{bill_type}/{number}/review/stance", response_model=Review)
def save_stance(
    congress: int,
    bill_type: BillType,
    number: int,
    stance: Annotated[Stance, Body(embed=True)],
    uid: Uid,
) -> dict[str, Any]:
    """Save the signed-in user's stance and return the review with its other fields intact."""
    bill_id = make_bill_id(congress, bill_type, number)
    with connect() as conn:
        check_review_target(conn, bill_id, uid)
        return conn.execute(
            f"""
            INSERT INTO reviews (uid, bill_id, stance)
            VALUES (%s, %s, %s)
            ON CONFLICT (uid, bill_id) DO UPDATE SET
                stance = EXCLUDED.stance,
                updated_at = CASE WHEN EXCLUDED.stance <> reviews.stance THEN now()
                                  ELSE reviews.updated_at END
            RETURNING {REVIEW_COLUMNS}
            """,
            (uid, bill_id, stance),
        ).fetchone()


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


@router.put("/bills/{congress}/{bill_type}/{number}/review/visibility", response_model=Review)
def set_visibility(
    congress: int, bill_type: BillType, number: int, visibility: ReviewVisibility, uid: Uid
) -> dict[str, Any]:
    """Hide the signed-in user's review from shared lists and counts, or show it again.

    Editing a hidden review keeps it hidden until its author shows it again.
    """
    row = fetch_one(
        f"""
        UPDATE reviews
        SET hidden_at = CASE WHEN %(hidden)s THEN COALESCE(hidden_at, now()) END
        WHERE uid = %(uid)s AND bill_id = %(bill_id)s
        RETURNING {REVIEW_COLUMNS}
        """,
        {
            "hidden": visibility.hidden,
            "uid": uid,
            "bill_id": make_bill_id(congress, bill_type, number),
        },
    )
    if row is None:
        raise HTTPException(404, "You have not reviewed this bill")
    return row


@router.get("/bills/{congress}/{bill_type}/{number}/reviews", response_model=ReviewPage)
def list_shared_reviews(
    congress: int,
    bill_type: BillType,
    number: int,
    page: Annotated[int, Query(ge=1)] = 1,
    limit: Annotated[int, Query(ge=1, le=50)] = 20,
) -> dict[str, Any]:
    """Return the reviews of a bill that their authors shared, most recently edited first.

    Each one carries the state and district its author saved, which is what makes it a verified
    neighbor's view. Names and phone numbers never leave the database.
    """
    bill_id = make_bill_id(congress, bill_type, number)
    if fetch_one("SELECT 1 FROM bills WHERE bill_id = %s", (bill_id,)) is None:
        raise HTTPException(404, "Bill not found")
    where = f"r.bill_id = %(bill_id)s AND {SHARED_REVIEW_SQL}"
    params = {"bill_id": bill_id}
    total = fetch_one(f"SELECT count(*) AS n FROM reviews r WHERE {where}", params)["n"]
    reviews = fetch_all(
        f"""
        SELECT r.review_id, r.bill_id, r.stance, r.story, r.action_taken, u.state, u.district,
               r.created_at, r.updated_at,
               ARRAY(SELECT DISTINCT p.platform FROM post_cards p
                     WHERE p.review_id = r.review_id AND NOT p.hidden_on_pull
                     ORDER BY p.platform) AS posted_to
        FROM reviews r JOIN users u ON u.uid = r.uid
        WHERE {where}
        ORDER BY r.updated_at DESC, r.review_id DESC
        LIMIT %(limit)s OFFSET %(offset)s
        """,
        {**params, "limit": limit, "offset": (page - 1) * limit},
    )
    return {"total": total, "page": page, "limit": limit, "data": reviews}


@router.post("/reviews/{review_id}/reports", status_code=204)
def report_review(
    review_id: int,
    report: ReportIn,
    uid: Annotated[str | None, Depends(optional_uid)],
) -> Response:
    """Record a report of a shared review from a signed-in user or a visitor.

    A signed-in person's second report of the same review changes nothing. Reports from
    different signed-in people withhold the review from shared lists once there are enough.
    """
    with connect() as conn:
        review = conn.execute(
            "SELECT uid FROM reviews WHERE review_id = %s AND share_publicly AND hidden_at IS NULL",
            (review_id,),
        ).fetchone()
        if review is None:
            raise HTTPException(404, "Review not found")
        if uid is not None and uid == review["uid"]:
            raise HTTPException(403, "You cannot report your own review")
        # Someone verified with Firebase who never finished signing up reports as a visitor
        registered = (
            uid is not None
            and conn.execute("SELECT 1 FROM users WHERE uid = %s", (uid,)).fetchone()
        )
        conn.execute(
            """
            INSERT INTO review_reports (review_id, reporter_uid, reason, details)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (review_id, reporter_uid) WHERE reporter_uid IS NOT NULL DO NOTHING
            """,
            (review_id, uid if registered else None, report.reason, report.details),
        )
    return Response(status_code=204)
