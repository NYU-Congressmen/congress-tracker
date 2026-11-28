from typing import Annotated, Any

from fastapi import APIRouter, Depends

from app.ai.briefs import BRIEF_INPUTS
from app.auth import current_uid
from app.db import fetch_all
from app.models import Ask, Representative
from app.routes.signal import MIN_COUNTED, OFFICES_SQL, window_params

router = APIRouter(tags=["representatives"])
Uid = Annotated[str, Depends(current_uid)]

# Each bill's final House vote is its latest vote to pass or to concur, so procedural votes
# such as a motion to recommit never stand in for where a member landed on the bill.
VOTING_RECORD_SQL = """
    WITH final AS (
        SELECT DISTINCT ON (v.bill_id) v.bill_id, v.congress, v.session, v.roll_number,
               v.question, v.vote_date
        FROM house_votes v
        WHERE v.question ILIKE '%%pass%%' OR v.question ILIKE '%%concur%%'
        ORDER BY v.bill_id, v.vote_date DESC, v.roll_number DESC
    )
    SELECT f.bill_id, b.congress, b.type, b.number, b.title, r.stance, f.question,
           f.vote_date, f.roll_number, p.position
    FROM reviews r
    JOIN final f ON f.bill_id = r.bill_id
    JOIN bills b ON b.bill_id = r.bill_id
    LEFT JOIN house_vote_positions p
      ON (p.congress, p.session, p.roll_number) = (f.congress, f.session, f.roll_number)
     AND p.bioguide_id = %(bioguide_id)s
    WHERE r.uid = %(uid)s AND r.stance IN ('support', 'oppose')
    ORDER BY f.vote_date DESC
"""

FOR_POSITIONS = {"Yea", "Aye"}
AGAINST_POSITIONS = {"Nay", "No"}


def voting_record(uid: str, bioguide_id: str) -> dict[str, Any]:
    """Compare a House member's final votes with the reader's Support and Oppose stances."""
    votes = []
    for row in fetch_all(VOTING_RECORD_SQL, {"uid": uid, "bioguide_id": bioguide_id}):
        position = row["position"]
        voted = position in FOR_POSITIONS or position in AGAINST_POSITIONS
        agrees = (position in FOR_POSITIONS) == (row["stance"] == "support") if voted else None
        votes.append({**row, "agrees": agrees})
    return {
        "compared": sum(vote["agrees"] is not None for vote in votes),
        "agreed": sum(vote["agrees"] is True for vote in votes),
        "missed": sum(vote["agrees"] is None for vote in votes),
        "votes": votes,
    }


@router.get("/account/representatives", response_model=list[Representative])
def my_representatives(uid: Uid) -> list[dict[str, Any]]:
    """Return the reader's House member and senators with their record toward this reader.

    Each office carries the past week's public Constituent Signal, the calls this reader logged
    to it, and for a House member the final votes on bills where the reader chose Support or
    Oppose. Senate roll calls are not synced, so senators have no voting record.
    """
    offices = fetch_all(OFFICES_SQL, {"uid": uid})
    if not offices:
        return []
    params = window_params(uid, offices=[office["bioguide_id"] for office in offices])
    signal: dict[str, dict[str, int]] = {}
    for row in fetch_all(BRIEF_INPUTS, params):
        counted = row["support_count"] + row["oppose_count"] + row["unsure_count"]
        if counted < MIN_COUNTED:
            continue
        tally = signal.setdefault(row["bioguide_id"], {"bills": 0, "constituents": 0})
        tally["bills"] += 1
        tally["constituents"] += counted
    calls = {
        row["bioguide_id"]: row["n"]
        for row in fetch_all(
            "SELECT bioguide_id, count(*) AS n FROM actions "
            "WHERE uid = %s AND action_type = 'call' GROUP BY bioguide_id",
            (uid,),
        )
    }
    return [
        {
            **office,
            "signal_bills": signal.get(office["bioguide_id"], {}).get("bills", 0),
            "signal_constituents": signal.get(office["bioguide_id"], {}).get("constituents", 0),
            "your_calls": calls.get(office["bioguide_id"], 0),
            "voting_record": (
                voting_record(uid, office["bioguide_id"]) if office["chamber"] == "House" else None
            ),
        }
        for office in offices
    ]


@router.get("/account/asks", response_model=list[Ask])
def my_asks(uid: Uid) -> list[dict[str, Any]]:
    """Return the bills the reader took a stance on or tracks, with what changed and their calls."""
    return fetch_all(
        """
        WITH mine AS (
            SELECT bill_id FROM reviews WHERE uid = %(uid)s
            UNION SELECT bill_id FROM tracked_bills WHERE uid = %(uid)s
        )
        SELECT b.bill_id, b.congress, b.type, b.number, b.title, b.status, b.passed_house,
               b.passed_senate, b.introduced_date, b.latest_action_date, b.latest_action_text,
               r.stance,
               t.uid IS NOT NULL AS tracking,
               (SELECT count(*) FROM notifications n
                WHERE n.uid = %(uid)s AND n.bill_id = b.bill_id AND NOT n.is_read) AS unread,
               (SELECT count(*) FROM actions a
                WHERE a.uid = %(uid)s AND a.bill_id = b.bill_id AND a.action_type = 'call') AS calls
        FROM mine
        JOIN bills b USING (bill_id)
        LEFT JOIN reviews r ON r.bill_id = b.bill_id AND r.uid = %(uid)s
        LEFT JOIN tracked_bills t ON t.bill_id = b.bill_id AND t.uid = %(uid)s
        ORDER BY unread DESC, b.latest_action_date DESC NULLS LAST
        LIMIT 30
        """,
        {"uid": uid},
    )
