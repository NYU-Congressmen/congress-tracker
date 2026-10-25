from fastapi import APIRouter
from pydantic import BaseModel

from app.config import settings

router = APIRouter(tags=["health"])


class Health(BaseModel):
    status: str
    database_configured: bool
    congress_api_configured: bool


@router.get("/health")
def health() -> Health:
    """Report that the API is running and which external services are configured."""
    return Health(
        status="ok",
        database_configured=settings.database_url is not None,
        congress_api_configured=settings.congress_api_key is not None,
    )
