from typing import Any

from app.db import execute_many
from app.sync.client import CongressClient
from app.sync.states import PARTY_CODES, STATE_CODES

SAVE_MEMBER_SQL = """
INSERT INTO members (bioguide_id, name, party, state, chamber, district, image_url)
    VALUES (%(bioguide_id)s, %(name)s, %(party)s, %(state)s, %(chamber)s, %(district)s,
            %(image_url)s)
    ON CONFLICT (bioguide_id) DO UPDATE SET
        name = EXCLUDED.name,
        party = EXCLUDED.party,
        state = EXCLUDED.state,
        chamber = EXCLUDED.chamber,
        district = EXCLUDED.district,
        image_url = EXCLUDED.image_url
"""


def clean_member(m: dict[str, Any]) -> dict[str, Any]:
    # Turn one member from the Congress.gov list into a row for the members table.
    current_term = m["terms"]["item"][-1]
    return {
        "bioguide_id": m["bioguideId"],
        "name": m["name"],
        "party": PARTY_CODES.get(m.get("partyName")),
        "state": STATE_CODES.get(m.get("state")),
        "chamber": "House" if current_term["chamber"].startswith("House") else "Senate",
        "district": m.get("district"),
        "image_url": m.get("depiction", {}).get("imageUrl"),
    }


def sync_members(client: CongressClient) -> int:
    # Download every current member and upsert them. Returns how many were saved.
    members = client.paginate("/member", "members", currentMember="true")
    rows = [clean_member(m) for m in members]
    execute_many(SAVE_MEMBER_SQL, rows)
    return len(rows)
