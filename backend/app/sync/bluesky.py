import re
from datetime import timedelta
from typing import Any
from urllib.parse import urlsplit

import httpx

from app.config import settings
from app.db import connect, fetch_all
from app.sharing import share_url

TIMEOUT = 15.0
# The search's own maximum page size
SEARCH_LIMIT = 100
# Posts usually appear soon after a link is made, so older links are not searched again
SEARCH_WINDOW = timedelta(days=30)

URL_IN_TEXT = re.compile(r"(?:https?://)?[\w.-]+\.[a-z]{2,}/s/[A-Za-z0-9_-]+", re.IGNORECASE)

SAVE_POST_SQL = """
    INSERT INTO post_cards (review_id, platform, post_url, share_code, posted_at)
    VALUES (%(review_id)s, 'bluesky', %(post_url)s, %(share_code)s, %(posted_at)s)
    ON CONFLICT (post_url) DO NOTHING
"""


class BlueskyClient:
    """Search Bluesky posts as Pull's own account, which the search requires."""

    def __init__(
        self,
        handle: str,
        app_password: str,
        service: str = "https://bsky.social",
        transport: httpx.BaseTransport | None = None,
    ):
        self._http = httpx.Client(base_url=service, timeout=TIMEOUT, transport=transport)
        # An app password signs in without the account's real password and can be revoked alone
        session = self._http.post(
            "/xrpc/com.atproto.server.createSession",
            json={"identifier": handle, "password": app_password},
        )
        session.raise_for_status()
        self._http.headers["Authorization"] = f"Bearer {session.json()['accessJwt']}"

    def __enter__(self) -> "BlueskyClient":
        return self

    def __exit__(self, *exc: object) -> None:
        self._http.close()

    def search(self, query: str, url: str) -> list[dict[str, Any]]:
        """Return the newest posts matching a query and linking to a URL.

        The search's query syntax is unspecified, so a query it rejects counts as no match.
        """
        response = self._http.get(
            "/xrpc/app.bsky.feed.searchPosts",
            params={"q": query, "url": url, "sort": "latest", "limit": SEARCH_LIMIT},
        )
        if response.status_code == 400:
            return []
        response.raise_for_status()
        return response.json().get("posts", [])


def links_in_post(post: dict[str, Any]) -> set[str]:
    """Return every link a post carries in its text, link facets or link card."""
    record = post.get("record") or {}
    links = set(URL_IN_TEXT.findall(record.get("text") or ""))
    for facet in record.get("facets") or []:
        for feature in facet.get("features") or []:
            if feature.get("$type") == "app.bsky.richtext.facet#link" and feature.get("uri"):
                links.add(feature["uri"])
    for embed in (record.get("embed"), post.get("embed")):
        external = (embed or {}).get("external") or {}
        if external.get("uri"):
            links.add(external["uri"])
    return links


def carries_link(post: dict[str, Any], code: str) -> bool:
    """Return whether a post links to the share link with this code."""
    for link in links_in_post(post):
        path = urlsplit(link if "://" in link else f"https://{link}").path.rstrip("/")
        if path.endswith(f"/s/{code}"):
            return True
    return False


def post_web_url(post: dict[str, Any]) -> str:
    """Return a post's bsky.app address from its at:// URI, which names its author's DID."""
    did, _collection, rkey = post["uri"].removeprefix("at://").split("/")
    return f"https://bsky.app/profile/{did}/post/{rkey}"


def find_posts(client: BlueskyClient) -> int:
    """Search for posts carrying recent share links, record new ones and return how many."""
    links = fetch_all(
        """
        SELECT code, review_id FROM share_links
        WHERE created_at > now() - %s
        ORDER BY searched_at NULLS FIRST, created_at
        """,
        (SEARCH_WINDOW,),
    )
    host = urlsplit(settings.public_site_url).netloc
    found = 0
    for link in links:
        url = share_url(link["code"])
        try:
            # The link as people see it in a post first, then the bare code
            posts = []
            for query in (f"{host}/s/{link['code']}", link["code"]):
                posts = [p for p in client.search(query, url) if carries_link(p, link["code"])]
                if posts:
                    break
        except httpx.HTTPError as error:
            print(f"Bluesky search for {url} failed: {error}")
            continue
        rows = [
            {
                "review_id": link["review_id"],
                "post_url": post_web_url(post),
                "share_code": link["code"],
                "posted_at": (post.get("record") or {}).get("createdAt"),
            }
            for post in posts
        ]
        with connect() as conn:
            for row in rows:
                found += conn.execute(SAVE_POST_SQL, row).rowcount
            conn.execute(
                "UPDATE share_links SET searched_at = now() WHERE code = %s", (link["code"],)
            )
    return found


def sync_bluesky_posts(transport: httpx.BaseTransport | None = None) -> int | None:
    """Find new Bluesky posts carrying share links, or return None without an account set up."""
    if not (settings.bluesky_handle and settings.bluesky_app_password):
        return None
    try:
        with BlueskyClient(
            settings.bluesky_handle,
            settings.bluesky_app_password,
            settings.bluesky_service,
            transport=transport,
        ) as client:
            return find_posts(client)
    except httpx.HTTPError as error:
        print(f"Signing in to Bluesky failed: {error}")
        return 0
