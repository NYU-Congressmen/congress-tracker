from typing import Any

import httpx

from app.db import connect, execute_many, fetch_all
from app.sync.client import CongressClient
from app.sync.states import PARTY_CODES, STATE_CODES

SAVE_MEMBER_SQL = """
INSERT INTO members (bioguide_id, name, party, state, chamber, district, image_url, is_current,
                     update_date)
    VALUES (%(bioguide_id)s, %(name)s, %(party)s, %(state)s, %(chamber)s, %(district)s,
            %(image_url)s, %(is_current)s, %(update_date)s)
    ON CONFLICT (bioguide_id) DO UPDATE SET
        name = EXCLUDED.name,
        party = EXCLUDED.party,
        state = EXCLUDED.state,
        chamber = EXCLUDED.chamber,
        district = EXCLUDED.district,
        image_url = EXCLUDED.image_url,
        is_current = EXCLUDED.is_current,
        update_date = EXCLUDED.update_date
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
        "update_date": m.get("updateDate"),
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
        "update_date": m.get("updateDate"),
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


# Copies the record version the details came from, so the member counts as fresh until it changes
SAVE_CONTACT_SQL = """
    UPDATE members SET
        office_phone = %(office_phone)s,
        office_address = %(office_address)s,
        website_url = %(website_url)s,
        contact_update_date = update_date
    WHERE bioguide_id = %(bioguide_id)s
"""


def clean_contact(m: dict[str, Any]) -> dict[str, Any]:
    """Return a member's office phone, address and website from their member detail."""
    address = m.get("addressInformation") or {}
    return {
        "bioguide_id": m["bioguideId"],
        "office_phone": address.get("phoneNumber"),
        "office_address": address.get("officeAddress"),
        "website_url": m.get("officialWebsiteUrl"),
    }


def sync_contacts(client: CongressClient) -> int:
    """Fetch contact details for current members whose record changed, and return how many."""
    stale = fetch_all(
        "SELECT bioguide_id FROM members "
        "WHERE is_current AND contact_update_date IS DISTINCT FROM update_date"
    )
    rows = []
    for member in stale:
        try:
            rows.append(clean_contact(client.get(f"/member/{member['bioguide_id']}")["member"]))
        except httpx.HTTPError as error:
            # Left stale, so the next sync tries this member again
            print(f"Contact details for {member['bioguide_id']} failed: {error}")
    execute_many(SAVE_CONTACT_SQL, rows)
    return len(rows)
