import sys

from app.config import settings
from app.db import connect
from app.sync.bills import sync_bills
from app.sync.bluesky import sync_bluesky_posts
from app.sync.client import CongressClient
from app.sync.graph import sync_followed_graphs
from app.sync.members import sync_contacts, sync_members
from app.sync.summaries import sync_summaries
from app.sync.votes import sync_followed_votes
from app.tracking import notify_tracked_updates


def main() -> int:
    """Check the API key, then copy Congress.gov data into the database when one is configured."""
    if not settings.congress_api_key:
        print("CONGRESS_API_KEY is not set. Add it to the .env file at the repo root.")
        return 1
    with CongressClient(settings.congress_api_key, retry_read_timeouts=True) as client:
        bills = client.get("/bill", limit=1)["pagination"]["count"]
        members = client.get("/member", currentMember="true", limit=1)["pagination"]["count"]
        print(f"Congress.gov is reachable: {bills:,} bills and {members:,} current members.")
        # Teammates without a database can still use the command to check their key
        if not settings.database_url:
            print("DATABASE_URL is not set, so nothing was saved.")
            return 0

        saved = sync_members(client)
        print(f"Saved {saved} members.")
        saved = sync_bills(client)
        print(f"Saved {saved} bills.")
        saved = sync_summaries(client)
        print(f"Saved {saved} summaries.")
        saved = sync_contacts(client)
        print(f"Fetched contact details for {saved} members.")
        saved = sync_followed_graphs(client)
        print(f"Fetched cosponsors, committees and related bills for {saved} followed bills.")
        saved = sync_followed_votes(client)
        print(f"Fetched member positions for {saved} House votes on followed bills.")
        with connect() as conn:
            saved = notify_tracked_updates(conn)
        print(f"Recorded {saved} notifications of new actions on tracked bills.")
    found = sync_bluesky_posts()
    if found is None:
        print("BLUESKY_HANDLE and BLUESKY_APP_PASSWORD are not set, so no posts were searched.")
    else:
        print(f"Found {found} new Bluesky posts carrying share links.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
