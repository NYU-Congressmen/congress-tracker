import sys

from app.config import settings
from app.sync.client import CongressClient


def main() -> int:
    """Check the API key against Congress.gov, report the data available and return an exit code."""
    if not settings.congress_api_key:
        print("CONGRESS_API_KEY is not set. Add it to the .env file at the repo root.")
        return 1
    with CongressClient(settings.congress_api_key) as client:
        bills = client.get("/bill", limit=1)["pagination"]["count"]
        members = client.get("/member", currentMember="true", limit=1)["pagination"]["count"]
    print(f"Congress.gov is reachable: {bills:,} bills and {members:,} current members.")
    # The sync only checks the connection until the schema migration exists to write into
    print("Database writes start once the schema migration is added.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
