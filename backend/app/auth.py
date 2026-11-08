from typing import Annotated

from fastapi import Header, HTTPException


def current_uid(authorization: Annotated[str | None, Header()] = None) -> str:
    """Return the Firebase UID of the signed-in caller, or refuse the request.

    Every route that acts for a user asks for this, so verifying Firebase tokens later only
    changes this function. Until then nobody is signed in, and tests stand in a user of their
    own through FastAPI's dependency overrides.
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Sign in to continue")
    raise HTTPException(401, "Sign-in is not available yet")
