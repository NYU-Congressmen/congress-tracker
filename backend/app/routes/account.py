from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response
from psycopg.errors import UniqueViolation

from app.auth import PhoneIdentity, current_phone_identity
from app.db import connect

router = APIRouter(tags=["account"])


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
