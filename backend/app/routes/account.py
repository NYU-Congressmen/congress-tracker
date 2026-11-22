from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response
from psycopg.errors import UniqueViolation

from app.auth import PhoneIdentity, current_phone_identity, current_uid
from app.db import connect, fetch_one
from app.geocoding import district_for_address
from app.models import AccountDistrict, DistrictAddress

router = APIRouter(tags=["account"])


@router.post("/district-lookup", response_model=AccountDistrict)
def lookup_district(address: DistrictAddress) -> AccountDistrict:
    """Return the Census district for a street address during browser profile setup."""
    return district_for_address(address.address)


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
