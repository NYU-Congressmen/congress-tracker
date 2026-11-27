"""Resolve whatever a reader types into the district search to candidate districts.

A full street address goes to the Census geocoder, which can verify one district. Everything
else narrows by the most specific part the text contains: a ZIP code lists the districts that
overlap it, and a state lists all of its districts. Only the geocoder needs an upstream request,
so a Census outage still leaves the ZIP and state fallbacks working.
"""

import re

from fastapi import HTTPException

from app.db import connect
from app.geocoding import census_districts
from app.models import DistrictCandidate, DistrictSearchResult, MemberBrief
from app.sync.states import STATE_CODES
from app.zip_districts import districts_for_zip, districts_in_state

ZIP_ONLY = re.compile(r"^(\d{5})(?:-?\d{4})?$")
ZIP_ANYWHERE = re.compile(r"(?<!\d)(\d{5})(?:-\d{4})?(?!\d)")
COUNTRY_SUFFIX = re.compile(
    r"[\s,]*(?:usa|u\.s\.a\.|us|u\.s\.|united states(?: of america)?)$", re.I
)
POSTAL_CODES = set(STATE_CODES.values())
# Longest names first, so West Virginia is found before Virginia.
STATE_NAMES = sorted(
    ((name.lower(), code) for name, code in STATE_CODES.items()), key=lambda s: -len(s[0])
)


def normalize(query: str) -> str:
    """Return the query with whitespace collapsed and a trailing country name removed."""
    text = re.sub(r"\s+", " ", query).strip(" ,.")
    return COUNTRY_SUFFIX.sub("", text).strip(" ,.")


def zip_in(text: str) -> str | None:
    """Return the last five-digit ZIP code in the text, skipping a house number that opens it."""
    found = [match for match in ZIP_ANYWHERE.finditer(text) if match.start() > 0]
    return found[-1].group(1) if found else None


def state_in(text: str) -> str | None:
    """Return the postal code of a state named or abbreviated at the end of the text."""
    rest = ZIP_ANYWHERE.sub("", text).strip(" ,.")
    lowered = rest.lower()
    for name, code in STATE_NAMES:
        if lowered == name or re.search(rf"[\s,]{re.escape(name)}$", lowered):
            return code
    tokens = re.split(r"[\s,]+", rest)
    last = tokens[-1] if tokens else ""
    # A bare token like "in" or "me" is a state only when written as a postal code or set off by
    # a comma, so a street name ending in such a word is not mistaken for one.
    if last.upper() in POSTAL_CODES and (last.isupper() or len(tokens) == 1 or ", " + last in rest):
        return last.upper()
    return None


def looks_like_street(text: str) -> bool:
    """Return whether the text has a house number and words, which the geocoder needs."""
    # A trailing ZIP code is not a house number, so "Brooklyn, NY 11201" skips the geocoder.
    rest = re.sub(r"[\s,]*\d{5}(?:-\d{4})?$", "", text)
    return bool(re.search(r"\d", rest) and re.search(r"[A-Za-z]{2}", rest))


def resolve(query: str) -> tuple[str, list[tuple[str, int | None]]]:
    """Return how the query was matched and its candidate districts, best match first."""
    text = normalize(query)
    zip_only = ZIP_ONLY.match(text)
    if zip_only:
        districts = districts_for_zip(zip_only.group(1))
        if districts:
            return "zip", districts
        raise HTTPException(422, "That ZIP code has no congressional district on record.")

    census_error: HTTPException | None = None
    if looks_like_street(text):
        try:
            matched = census_districts(text)
        except HTTPException as error:
            census_error = error
        else:
            if matched:
                return "address", sorted(matched, key=lambda item: (item[0], item[1] or 0))

    zip_code = zip_in(text)
    if zip_code and districts_for_zip(zip_code):
        return "zip", districts_for_zip(zip_code)
    state = state_in(text)
    if state and districts_in_state(state):
        return "state", districts_in_state(state)
    if census_error is not None:
        raise census_error
    raise HTTPException(
        422,
        "No district matched. Enter a street address with city and state, a ZIP code or a state.",
    )


def search(query: str) -> DistrictSearchResult:
    """Return the candidate districts for a query with their House members and senators."""
    source, districts = resolve(query)
    states = sorted({state for state, _ in districts})
    with connect() as conn:
        rows = conn.execute(
            """
            SELECT bioguide_id, name, party, image_url, state, chamber,
                   COALESCE(district, 0) AS seat
            FROM members
            WHERE is_current AND state = ANY(%s) AND chamber IN ('House', 'Senate')
            ORDER BY name
            """,
            (states,),
        ).fetchall()
    house = {
        (row["state"], row["seat"]): MemberBrief(**row) for row in rows if row["chamber"] == "House"
    }
    return DistrictSearchResult(
        source=source,
        districts=[
            DistrictCandidate(
                state=state, district=district, representative=house.get((state, district or 0))
            )
            for state, district in districts
        ],
        senators=[MemberBrief(**row) for row in rows if row["chamber"] == "Senate"],
    )
