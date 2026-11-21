from dataclasses import dataclass
from threading import Lock
from typing import Annotated

from fastapi import Depends, Header, HTTPException
from firebase_admin import App, auth, exceptions, get_app, initialize_app
from google.auth.exceptions import GoogleAuthError

from app.config import settings

_app_lock = Lock()


@dataclass(frozen=True)
class PhoneIdentity:
    """A Firebase account's verified identity and phone number."""

    uid: str
    phone: str


def firebase_app(project_id: str) -> App:
    """Return the Admin app for the configured project."""
    # Concurrent requests can arrive before the first Admin app exists.
    with _app_lock:
        try:
            return get_app(project_id)
        except ValueError:
            return initialize_app(options={"projectId": project_id}, name=project_id)


def current_phone_identity(
    authorization: Annotated[str | None, Header()] = None,
) -> PhoneIdentity:
    """Verify a Firebase bearer token and return the caller's UID and verified phone number."""
    scheme, _, token = (authorization or "").partition(" ")
    token = token.strip()
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(401, "Sign in to continue", headers={"WWW-Authenticate": "Bearer"})

    project_id = settings.firebase_project_id
    if not project_id:
        raise HTTPException(503, "Sign-in is unavailable.")

    try:
        claims = auth.verify_id_token(token, app=firebase_app(project_id))
    except auth.CertificateFetchError as error:
        raise HTTPException(503, "Sign-in is unavailable.") from error
    except (auth.InvalidIdTokenError, ValueError) as error:
        raise HTTPException(
            401, "Sign in again to continue.", headers={"WWW-Authenticate": "Bearer"}
        ) from error
    except (exceptions.FirebaseError, GoogleAuthError) as error:
        raise HTTPException(503, "Sign-in is unavailable.") from error

    phone = claims.get("phone_number")
    if claims.get("firebase", {}).get("sign_in_provider") != "phone" or not isinstance(phone, str):
        raise HTTPException(403, "Sign in with a verified phone number.")
    return PhoneIdentity(uid=claims["uid"], phone=phone)


def current_uid(identity: Annotated[PhoneIdentity, Depends(current_phone_identity)]) -> str:
    """Return the verified Firebase UID for routes scoped to a single account."""
    return identity.uid
