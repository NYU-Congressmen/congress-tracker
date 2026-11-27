from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException

from app.auth import current_uid
from app.db import connect, fetch_all, fetch_one
from app.models import (
    BillType,
    NotificationPage,
    NotificationsReadIn,
    TrackedBill,
    TrackStatus,
)
from app.sync.bills import make_bill_id

router = APIRouter(tags=["tracking"])
Uid = Annotated[str, Depends(current_uid)]
TRACK_PATH = "/bills/{congress}/{bill_type}/{number}/track"


@router.get(TRACK_PATH, response_model=TrackStatus)
def get_tracking(congress: int, bill_type: BillType, number: int, uid: Uid) -> dict[str, bool]:
    """Return whether this account tracks the bill."""
    row = fetch_one(
        "SELECT 1 FROM tracked_bills WHERE uid = %s AND bill_id = %s",
        (uid, make_bill_id(congress, bill_type, number)),
    )
    return {"tracking": row is not None}


@router.put(TRACK_PATH, response_model=TrackStatus)
def track_bill(congress: int, bill_type: BillType, number: int, uid: Uid) -> dict[str, bool]:
    """Start tracking the bill, so its new official actions become notifications."""
    bill_id = make_bill_id(congress, bill_type, number)
    with connect() as conn:
        found = conn.execute(
            """
            SELECT EXISTS (SELECT 1 FROM bills WHERE bill_id = %(bill_id)s) AS bill_found,
                   EXISTS (SELECT 1 FROM users WHERE uid = %(uid)s) AS user_found
            """,
            {"uid": uid, "bill_id": bill_id},
        ).fetchone()
        if not found["bill_found"]:
            raise HTTPException(404, "Bill not found")
        if not found["user_found"]:
            raise HTTPException(403, "Finish signing up before tracking a bill")
        conn.execute(
            "INSERT INTO tracked_bills (uid, bill_id) VALUES (%s, %s) ON CONFLICT DO NOTHING",
            (uid, bill_id),
        )
    return {"tracking": True}


@router.delete(TRACK_PATH, response_model=TrackStatus)
def untrack_bill(congress: int, bill_type: BillType, number: int, uid: Uid) -> dict[str, bool]:
    """Stop tracking the bill and drop its updates from this account."""
    bill_id = make_bill_id(congress, bill_type, number)
    with connect() as conn:
        conn.execute("DELETE FROM tracked_bills WHERE uid = %s AND bill_id = %s", (uid, bill_id))
        conn.execute("DELETE FROM notifications WHERE uid = %s AND bill_id = %s", (uid, bill_id))
    return {"tracking": False}


@router.get("/account/tracked", response_model=list[TrackedBill])
def list_tracked(uid: Uid) -> list[dict[str, Any]]:
    """Return the bills this account tracks, those with unread updates first."""
    return fetch_all(
        """
        SELECT b.bill_id, b.congress, b.type, b.number, b.title, b.status, b.passed_house,
               b.passed_senate, b.introduced_date, b.latest_action_date, b.latest_action_text,
               t.followed_at, u.unread
        FROM tracked_bills t
        JOIN bills b ON b.bill_id = t.bill_id
        CROSS JOIN LATERAL (
            SELECT count(*) AS unread FROM notifications n
            WHERE n.uid = t.uid AND n.bill_id = t.bill_id AND NOT n.is_read
        ) u
        WHERE t.uid = %s
        ORDER BY u.unread > 0 DESC, b.latest_action_date DESC NULLS LAST, t.followed_at DESC
        LIMIT 50
        """,
        (uid,),
    )


@router.get("/account/notifications", response_model=NotificationPage)
def list_notifications(uid: Uid) -> dict[str, Any]:
    """Return this account's 20 most recent updates and how many are unread."""
    unread = fetch_one(
        "SELECT count(*) AS n FROM notifications WHERE uid = %s AND NOT is_read", (uid,)
    )["n"]
    data = fetch_all(
        """
        SELECT n.notification_id, n.bill_id, b.congress, b.type, b.number, b.title, n.message,
               n.is_read, n.created_at
        FROM notifications n JOIN bills b ON b.bill_id = n.bill_id
        WHERE n.uid = %s
        ORDER BY n.created_at DESC, n.notification_id DESC
        LIMIT 20
        """,
        (uid,),
    )
    return {"unread": unread, "data": data}


@router.put("/account/notifications/read", response_model=NotificationPage)
def mark_read(changes: NotificationsReadIn, uid: Uid) -> dict[str, Any]:
    """Mark one bill's updates read when a bill is given, or every update, and return the list."""
    with connect() as conn:
        conn.execute(
            """
            UPDATE notifications SET is_read = true
            WHERE uid = %(uid)s AND NOT is_read
              AND (%(bill_id)s::text IS NULL OR bill_id = %(bill_id)s)
            """,
            {"uid": uid, "bill_id": changes.bill_id},
        )
        if changes.bill_id is not None:
            conn.execute(
                "UPDATE tracked_bills SET last_seen_at = now() WHERE uid = %s AND bill_id = %s",
                (uid, changes.bill_id),
            )
    return list_notifications(uid)
