from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response
from psycopg.errors import UniqueViolation
from psycopg.types.json import Jsonb

from app.auth import PhoneIdentity, current_phone_identity, current_uid
from app.db import connect, fetch_one
from app.district_search import search as search_districts
from app.geocoding import district_for_address
from app.models import (
    AccountDistrict,
    AccountProfile,
    DistrictAddress,
    DistrictQuery,
    DistrictSearchResult,
    ProfilePreferences,
)

router = APIRouter(tags=["account"])

# Use the existing verified district when an account first opens its profile.
PROFILE_DEFAULT = """
    jsonb_build_object('district', CASE WHEN state IS NOT NULL THEN
        jsonb_build_object('state', state, 'district', NULLIF(district, 0), 'method', 'address')
    END)
"""

PROFILE_COLUMNS = f"""
    COALESCE(profile, {PROFILE_DEFAULT}) AS preferences, profile IS NOT NULL AS saved,
    created_at, COALESCE((profile->>'updated_at')::timestamptz, created_at) AS updated_at
"""


def profile_response(row: dict | None) -> AccountProfile:
    """Return the signed-in account's editable profile."""
    if row is None:
        raise HTTPException(403, "Finish signing in before opening your profile.")
    return AccountProfile.model_validate({**row["preferences"], **row})


@router.get("/account/profile", response_model=AccountProfile)
def get_profile(uid: Annotated[str, Depends(current_uid)]) -> AccountProfile:
    """Return the caller's profile, with defaults for the first edit."""
    return profile_response(
        fetch_one(f"SELECT {PROFILE_COLUMNS} FROM users WHERE uid = %s", (uid,))
    )


@router.patch("/account/profile", response_model=AccountProfile)
def save_profile(
    patch: ProfilePreferences, uid: Annotated[str, Depends(current_uid)], initialize: bool = False
) -> AccountProfile:
    """Save the supplied preferences or import a first browser profile."""
    row = fetch_one(
        f"""
        UPDATE users
        SET profile = CASE WHEN %s AND profile IS NOT NULL THEN profile
            ELSE COALESCE(profile, {PROFILE_DEFAULT}) || %s::jsonb
                || jsonb_build_object('updated_at', now())
            END
        WHERE uid = %s
        RETURNING {PROFILE_COLUMNS}
        """,
        (initialize, Jsonb(patch.model_dump(mode="json", exclude_unset=True)), uid),
    )
    return profile_response(row)


@router.post("/district-search", response_model=DistrictSearchResult)
def district_search(body: DistrictQuery) -> DistrictSearchResult:
    """Return candidate districts and their members for an address, ZIP code or state."""
    return search_districts(body.query)


@router.put("/account", status_code=204)
def register_account(
    identity: Annotated[PhoneIdentity, Depends(current_phone_identity)],
) -> Response:
    """Create or update the verified Firebase user's account and return an empty response."""
    try:
        with connect() as conn:
            # Firebase owns the verified phone number, including changes to an existing account.
            conn.execute(
                """
                INSERT INTO users (uid, phone) VALUES (%s, %s)
                ON CONFLICT (uid) DO UPDATE SET phone = EXCLUDED.phone
                WHERE users.phone IS DISTINCT FROM EXCLUDED.phone
                """,
                (identity.uid, identity.phone),
            )
    except UniqueViolation as error:
        raise HTTPException(409, "This phone number is linked to another account.") from error
    return Response(status_code=204)


@router.get("/account/district", response_model=AccountDistrict | None)
def get_district(uid: Annotated[str, Depends(current_uid)]) -> AccountDistrict | None:
    """Return the caller's saved district, if one has been set."""
    row = fetch_one("SELECT state, district FROM users WHERE uid = %s", (uid,))
    return AccountDistrict.model_validate(row) if row and row["state"] else None


@router.put("/account/district", response_model=AccountDistrict)
def save_district(
    address: DistrictAddress, uid: Annotated[str, Depends(current_uid)]
) -> AccountDistrict:
    """Resolve a street address and save only the matching district to the caller's account."""
    if fetch_one("SELECT 1 FROM users WHERE uid = %s", (uid,)) is None:
        raise HTTPException(403, "Finish signing up before saving your district.")
    district = district_for_address(address.address)
    saved = fetch_one(
        "UPDATE users SET state = %s, district = %s WHERE uid = %s RETURNING state",
        (district.state, district.district, uid),
    )
    if saved is None:
        raise HTTPException(403, "Finish signing up before saving your district.")
    return district


@router.delete("/account/district", status_code=204)
def clear_district(uid: Annotated[str, Depends(current_uid)]) -> Response:
    """Forget the caller's address-matched district after they choose one another way."""
    # Response counts and shared reviews read this district, so it must not outlive the
    # profile's choice. Map and number choices stay in the browser profile only.
    with connect() as conn:
        conn.execute("UPDATE users SET state = NULL, district = NULL WHERE uid = %s", (uid,))
    return Response(status_code=204)
