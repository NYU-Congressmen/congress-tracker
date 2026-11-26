from typing import Annotated, Any

from fastapi import APIRouter, HTTPException, Query

from app.db import fetch_all, fetch_one
from app.models import BillType, HouseVote
from app.sync.bills import make_bill_id

router = APIRouter(tags=["bills"])


@router.get("/bills/{congress}/{bill_type}/{number}/house-votes", response_model=list[HouseVote])
def list_house_votes(
    congress: int,
    bill_type: BillType,
    number: int,
    bioguide_id: Annotated[str | None, Query(pattern="^[A-Za-z][0-9]{6}$")] = None,
    include_positions: bool = True,
) -> list[dict[str, Any]]:
    """Return a bill's House roll-call votes, oldest first, with each member's position.

    With bioguide_id, each vote lists only that member's position, which is how a page puts a
    representative's vote beside what Pull users said. The totals always count every member.
    A totals-only request omits member positions.
    The daily sync stores these for bills someone tracks or reviews.
    """
    bill_id = make_bill_id(congress, bill_type, number)
    if fetch_one("SELECT 1 FROM bills WHERE bill_id = %s", (bill_id,)) is None:
        raise HTTPException(404, "Bill not found")

    votes = fetch_all(
        """
        SELECT congress, session, roll_number, vote_date, question, result, vote_type,
               source_url, positions_synced_at IS NOT NULL AS positions_complete
        FROM house_votes WHERE bill_id = %s
        ORDER BY vote_date NULLS LAST, congress, session, roll_number
        """,
        (bill_id,),
    )
    totals = fetch_all(
        """
        SELECT p.congress, p.session, p.roll_number, p.position, count(*) AS n
        FROM house_vote_positions p
        JOIN house_votes v USING (congress, session, roll_number)
        WHERE v.bill_id = %s
        GROUP BY p.congress, p.session, p.roll_number, p.position
        """,
        (bill_id,),
    )
    member_filter = "AND p.bioguide_id = %(bioguide_id)s" if bioguide_id else ""
    positions = (
        fetch_all(
            f"""
            SELECT p.congress, p.session, p.roll_number, p.bioguide_id, m.name, p.party, p.state,
                   m.district, p.position
            FROM house_vote_positions p
            JOIN house_votes v USING (congress, session, roll_number)
            LEFT JOIN members m ON m.bioguide_id = p.bioguide_id
            WHERE v.bill_id = %(bill_id)s {member_filter}
            ORDER BY p.state, m.district NULLS FIRST, p.bioguide_id
            """,
            {"bill_id": bill_id, "bioguide_id": bioguide_id.upper() if bioguide_id else None},
        )
        if include_positions
        else []
    )

    by_vote = {(v["congress"], v["session"], v["roll_number"]): v for v in votes}
    for vote in votes:
        vote["totals"], vote["positions"] = {}, []
    for row in totals:
        by_vote[(row["congress"], row["session"], row["roll_number"])]["totals"][
            row["position"]
        ] = row["n"]
    for row in positions:
        by_vote[(row["congress"], row["session"], row["roll_number"])]["positions"].append(row)
    return votes
