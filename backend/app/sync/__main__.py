import sys

from app.config import settings
from app.sync.client import CongressClient
from app.sync.members import sync_members


def main() -> int:
    """Check the API key, then copy Congress.gov data into the database when one is configured."""
    if not settings.congress_api_key:
        print("CONGRESS_API_KEY is not set. Add it to the .env file at the repo root.")
        return 1
    with CongressClient(settings.congress_api_key) as client:
        bills = client.get("/bill", limit=1)["pagination"]["count"]
        members = client.get("/member", currentMember="true", limit=1)["pagination"]["count"]
        print(f"Congress.gov is reachable: {bills:,} bills and {members:,} current members.")
        # Teammates without a database can still use the command to check their key
        if not settings.database_url:
            print("DATABASE_URL is not set, so nothing was saved.")
            return 0

        saved = sync_members(client)
        print(f"Saved {saved} members.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
