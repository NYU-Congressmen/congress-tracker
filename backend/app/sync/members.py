from typing import Any

from app.db import connect
from app.sync.client import CongressClient
from app.sync.states import PARTY_CODES, STATE_CODES

SAVE_MEMBER_SQL = """
INSERT INTO members (bioguide_id, name, party, state, chamber, district, image_url, is_current)
    VALUES (%(bioguide_id)s, %(name)s, %(party)s, %(state)s, %(chamber)s, %(district)s,
            %(image_url)s, %(is_current)s)
    ON CONFLICT (bioguide_id) DO UPDATE SET
        name = EXCLUDED.name,
        party = EXCLUDED.party,
        state = EXCLUDED.state,
        chamber = EXCLUDED.chamber,
        district = EXCLUDED.district,
        image_url = EXCLUDED.image_url,
        is_current = EXCLUDED.is_current
"""


def chamber_name(term_chamber: str) -> str:
    """Return House or Senate for a chamber name as Congress.gov writes it in a term."""
    return "House" if term_chamber.startswith("House") else "Senate"


def clean_member(m: dict[str, Any]) -> dict[str, Any]:
    """Turn one member from the Congress.gov member list into a current-member row."""
    current_term = m["terms"]["item"][-1]
    return {
        "bioguide_id": m["bioguideId"],
        "name": m["name"],
        "party": PARTY_CODES.get(m.get("partyName")),
        "state": STATE_CODES.get(m.get("state")),
        "chamber": chamber_name(current_term["chamber"]),
        "district": m.get("district"),
        "image_url": m.get("depiction", {}).get("imageUrl"),
        "is_current": True,
    }


def clean_member_detail(m: dict[str, Any]) -> dict[str, Any]:
    """Turn a member record from the Congress.gov member detail endpoint into a row.

    The detail endpoint covers former members too, so the row records whether the member
    is still serving.
    """
    last_term = m["terms"][-1]
    return {
        "bioguide_id": m["bioguideId"],
        "name": m["invertedOrderName"],
        "party": m["partyHistory"][-1].get("partyAbbreviation"),
        "state": last_term.get("stateCode"),
        "chamber": chamber_name(last_term["chamber"]),
        "district": last_term.get("district"),
        "image_url": m.get("depiction", {}).get("imageUrl"),
        "is_current": bool(m.get("currentMember")),
    }


def sync_members(client: CongressClient) -> int:
    """Download every current member, upsert them and return how many were saved.

    Members missing from the download are marked as no longer current in the same
    transaction, so the member list never shows people who have left Congress.
    """
    rows = [clean_member(m) for m in client.paginate("/member", "members", currentMember="true")]
    with connect() as conn:
        conn.execute("UPDATE members SET is_current = false")
        conn.cursor().executemany(SAVE_MEMBER_SQL, rows)
    return len(rows)
