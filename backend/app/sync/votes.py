from typing import Any

import httpx

from app.db import connect, fetch_all
from app.sync.bills import make_bill_id
from app.sync.client import PAGE_SIZE, CongressClient
from app.sync.followed import followed_bills

# A vote another bill's actions already listed keeps its first bill
SAVE_HOUSE_VOTE_SQL = """
    INSERT INTO house_votes (congress, session, roll_number, bill_id, vote_date, source_url)
    VALUES (%(congress)s, %(session)s, %(roll_number)s, %(bill_id)s, %(vote_date)s,
            %(source_url)s)
    ON CONFLICT (congress, session, roll_number) DO UPDATE SET
        vote_date = COALESCE(EXCLUDED.vote_date, house_votes.vote_date),
        source_url = COALESCE(EXCLUDED.source_url, house_votes.source_url)
"""

SAVE_POSITION_SQL = """
    INSERT INTO house_vote_positions (congress, session, roll_number, bioguide_id, position,
                                      party, state)
    VALUES (%(congress)s, %(session)s, %(roll_number)s, %(bioguide_id)s, %(position)s,
            %(party)s, %(state)s)
"""

# Votes of followed bills whose positions were never fetched
PENDING_VOTES_SQL = """
    SELECT v.congress, v.session, v.roll_number
    FROM house_votes v
    WHERE v.positions_synced_at IS NULL
      AND (EXISTS (SELECT 1 FROM tracked_bills t WHERE t.bill_id = v.bill_id)
           OR EXISTS (SELECT 1 FROM reviews r WHERE r.bill_id = v.bill_id))
    ORDER BY v.congress, v.session, v.roll_number
"""


def votes_need_scan(row: dict[str, Any]) -> bool:
    """Return whether a bill's actions were never read for votes or the bill changed since."""
    if row["votes_scanned_at"] is None:
        return True
    version = row["votes_update_date"]
    return row["update_date"] is not None and (version is None or row["update_date"] > version)


def house_votes_from_actions(bill_id: str, actions: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Return the House roll-call votes a bill's actions record, each once."""
    votes = {}
    for action in actions:
        for vote in action.get("recordedVotes") or []:
            if vote.get("chamber") != "House":
                continue
            key = (int(vote["congress"]), int(vote["sessionNumber"]), int(vote["rollNumber"]))
            votes[key] = {
                "congress": key[0],
                "session": key[1],
                "roll_number": key[2],
                "bill_id": bill_id,
                "vote_date": vote.get("date"),
                "source_url": vote.get("url"),
            }
    return list(votes.values())


def scan_bill_votes(client: CongressClient, bill: dict[str, Any]) -> int:
    """Read a bill's actions, store the House votes they record and return how many there are."""
    bill_id = make_bill_id(bill["congress"], bill["type"], bill["number"])
    path = f"/bill/{bill['congress']}/{bill['type']}/{bill['number']}/actions"
    votes = house_votes_from_actions(bill_id, list(client.paginate(path, "actions")))
    with connect() as conn:
        conn.cursor().executemany(SAVE_HOUSE_VOTE_SQL, votes)
        conn.execute(
            "UPDATE bills SET votes_scanned_at = now(), votes_update_date = update_date"
            " WHERE bill_id = %s",
            (bill_id,),
        )
    return len(votes)


def fetch_member_votes(
    client: CongressClient, congress: int, session: int, roll_number: int
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    """Return a House vote's details and every member's recorded position on it."""
    path = f"/house-vote/{congress}/{session}/{roll_number}/members"
    details: dict[str, Any] = {}
    positions: dict[str, dict[str, Any]] = {}
    offset = 0
    while True:
        page = client.get(path, limit=PAGE_SIZE, offset=offset)
        details = page.get("houseRollCallVoteMemberVotes", page)
        results = details.get("results") or []
        before = len(positions)
        for result in results:
            # The OpenAPI file spells it bioguideID and the written guide bioguideId
            bioguide_id = result.get("bioguideID") or result.get("bioguideId")
            if bioguide_id and result.get("voteCast"):
                positions[bioguide_id] = {
                    "congress": congress,
                    "session": session,
                    "roll_number": roll_number,
                    "bioguide_id": bioguide_id,
                    "position": result["voteCast"],
                    "party": result.get("voteParty"),
                    "state": result.get("voteState"),
                }
        # A short page is the last, and a page with nobody new means paging is not supported
        if len(results) < PAGE_SIZE or len(positions) == before:
            return details, list(positions.values())
        offset += len(results)


def refresh_vote_positions(
    client: CongressClient, congress: int, session: int, roll_number: int
) -> int:
    """Store every member's position on one House vote and return how many were stored.

    A vote Congress.gov has no member records for stays pending, so a later sync tries again.
    """
    details, positions = fetch_member_votes(client, congress, session, roll_number)
    if not positions:
        return 0
    key = (congress, session, roll_number)
    with connect() as conn:
        conn.execute(
            """
            UPDATE house_votes SET question = %s, result = %s, vote_type = %s,
                                   positions_synced_at = now()
            WHERE congress = %s AND session = %s AND roll_number = %s
            """,
            (details.get("voteQuestion"), details.get("result"), details.get("voteType"), *key),
        )
        conn.execute(
            "DELETE FROM house_vote_positions"
            " WHERE congress = %s AND session = %s AND roll_number = %s",
            key,
        )
        conn.cursor().executemany(SAVE_POSITION_SQL, positions)
    return len(positions)


def sync_followed_votes(client: CongressClient) -> int:
    """Store House votes and positions for followed bills, and return how many votes were filled.

    A bill's actions are read again only after the bill changes, and each vote's positions are
    fetched once, so a quiet day costs no requests.
    """
    for bill in followed_bills():
        if not votes_need_scan(bill):
            continue
        try:
            scan_bill_votes(client, bill)
        except httpx.HTTPError as error:
            # Left unscanned, so the next sync tries this bill again
            print(f"Actions for {bill['bill_id']} failed: {error}")

    filled = 0
    for vote in fetch_all(PENDING_VOTES_SQL):
        try:
            if refresh_vote_positions(
                client, vote["congress"], vote["session"], vote["roll_number"]
            ):
                filled += 1
        except httpx.HTTPError as error:
            print(f"House vote {vote['congress']}-{vote['session']}-{vote['roll_number']}: {error}")
    return filled
