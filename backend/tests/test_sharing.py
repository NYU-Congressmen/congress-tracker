import json

import httpx
import psycopg
import pytest
from fastapi.testclient import TestClient

from app.auth import current_uid
from app.config import settings
from app.main import app
from app.sharing import card_description, shorten
from app.sync.bluesky import carries_link, post_web_url, sync_bluesky_posts
from tests.conftest import TEST_DATABASE_URL

SHARES = "/api/bills/119/hr/1/review/shares"
BROWSER = {"User-Agent": "Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 Safari/605.1.15"}


def sql(statement: str, params: tuple = ()) -> list[tuple]:
    with psycopg.connect(TEST_DATABASE_URL) as conn:
        cursor = conn.execute(statement, params)
        return cursor.fetchall() if cursor.description else []


@pytest.fixture
def client(db, monkeypatch):
    """Sign in as a user who reviewed a bill with a CRS summary, and sign out afterwards."""
    monkeypatch.setattr(settings, "public_site_url", "https://pull.example")
    sql(
        "INSERT INTO bills (bill_id, congress, type, number, title, latest_action_date,"
        " latest_action_text) VALUES ('119-hr-1', 119, 'hr', 1, 'Clinic <Access> Act',"
        " '2025-03-04', 'Referred to committee.')"
    )
    sql("INSERT INTO users (uid, phone) VALUES ('author', '+15550000001')")
    sql(
        "INSERT INTO reviews (uid, bill_id, stance, consent_to_share) "
        "VALUES ('author', '119-hr-1', 'oppose', true)"
    )
    sql(
        "INSERT INTO bill_summaries (bill_id, version_code, action_date, action_desc, text)"
        " VALUES ('119-hr-1', '00', '2025-01-03', 'Introduced in House',"
        " '<p>This bill keeps rural clinics open.</p>')"
    )
    app.dependency_overrides[current_uid] = lambda: "author"
    yield TestClient(app)
    app.dependency_overrides.clear()


def share(client: TestClient, platform: str = "bluesky") -> dict:
    response = client.put(f"{SHARES}/{platform}")
    assert response.status_code == 200
    return response.json()


def test_each_platform_gets_one_lasting_link(client):
    first = share(client)
    again = share(client)
    other = share(client, "x")

    assert first["code"] == again["code"]
    assert other["code"] != first["code"]
    assert first["url"] == f"https://pull.example/s/{first['code']}"
    assert len(first["code"]) == 8
    assert client.put(f"{SHARES}/myspace").status_code == 422


def test_sharing_needs_a_saved_review_and_sign_in(client):
    app.dependency_overrides[current_uid] = lambda: "someone-else"
    assert client.put(f"{SHARES}/bluesky").status_code == 404
    assert client.get(SHARES).status_code == 404
    app.dependency_overrides.clear()
    assert client.put(f"{SHARES}/bluesky").status_code == 401


def test_a_share_page_is_a_preview_card_that_sends_people_to_the_bill(client):
    code = share(client)["code"]

    response = client.get(f"/s/{code}", headers=BROWSER)

    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    page = response.text
    assert '<meta property="og:title" content="H.R. 1: Clinic &lt;Access&gt; Act">' in page
    assert 'content="This bill keeps rural clinics open."' in page
    assert f'<meta property="og:url" content="https://pull.example/s/{code}">' in page
    assert '<meta http-equiv="refresh" content="0; url=/bills/119/hr/1">' in page
    assert '<link rel="canonical" href="https://pull.example/bills/119/hr/1">' in page


def test_people_count_as_visits_and_preview_robots_do_not(client):
    code = share(client, "x")["code"]
    robots = ["Twitterbot/1.0", "Bluesky Cardyb/1.1", "facebookexternalhit/1.1", ""]
    for agent in robots:
        assert client.get(f"/s/{code}", headers={"User-Agent": agent}).status_code == 200
    client.get(f"/s/{code}", headers=BROWSER)
    client.get(f"/s/{code}", headers=BROWSER)

    (link,) = client.get(SHARES).json()["shared_to"]
    assert (link["platform"], link["visits"]) == ("x", 2)
    assert link["last_visited_at"] is not None


def test_unknown_or_malformed_codes_are_404(client):
    assert client.get("/s/doesnotexist", headers=BROWSER).status_code == 404
    assert client.get("/s/bad%20code!", headers=BROWSER).status_code == 404


def test_card_description_falls_back_to_the_latest_action():
    from datetime import date

    bill = {"latest_action_text": "Referred to committee.", "latest_action_date": date(2025, 3, 4)}

    assert card_description(bill, None) == "Latest action, Mar 4, 2025: Referred to committee."
    assert card_description({}, None).startswith("Follow this bill on Pull")
    long = shorten("word " * 100)
    assert long.endswith("…") and len(long) <= 201


def bluesky_post(code: str, rkey: str = "3kabc", how: str = "facet") -> dict:
    """Return a post view as searchPosts returns it, linking to the code the given way."""
    link = f"https://pull.example/s/{code}"
    record = {"text": "Where I stand on this bill", "createdAt": "2025-03-05T12:00:00Z"}
    if how == "facet":
        record["facets"] = [{"features": [{"$type": "app.bsky.richtext.facet#link", "uri": link}]}]
    elif how == "card":
        record["embed"] = {"$type": "app.bsky.embed.external", "external": {"uri": link}}
    else:
        record["text"] += f" pull.example/s/{code}"
    return {"uri": f"at://did:plc:maya/app.bsky.feed.post/{rkey}", "record": record}


@pytest.mark.parametrize("how", ["facet", "card", "text"])
def test_a_post_carries_a_link_in_its_facets_card_or_text(how):
    post = bluesky_post("k3Xa9QpL", how=how)

    assert carries_link(post, "k3Xa9QpL")
    assert not carries_link(post, "k3Xa9Qp")


def test_post_web_address_uses_the_authors_did():
    assert post_web_url(bluesky_post("abc")) == "https://bsky.app/profile/did:plc:maya/post/3kabc"


class FakeBluesky:
    """Sign in Pull's account and answer searches with canned posts, recording each request."""

    def __init__(self, posts: list[dict]):
        self.posts = posts
        self.requests = []

    def handle(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        if request.url.path == "/xrpc/com.atproto.server.createSession":
            body = json.loads(request.content)
            if body != {"identifier": "pull.bsky.social", "password": "app-password"}:
                return httpx.Response(401, json={"error": "AuthenticationRequired"})
            return httpx.Response(200, json={"accessJwt": "jwt", "did": "did:plc:pull"})
        if request.url.path == "/xrpc/app.bsky.feed.searchPosts":
            assert request.headers["Authorization"] == "Bearer jwt"
            return httpx.Response(200, json={"posts": self.posts})
        return httpx.Response(404)


def test_found_posts_become_posted_to_badges_once(client, monkeypatch):
    monkeypatch.setattr(settings, "bluesky_handle", "pull.bsky.social")
    monkeypatch.setattr(settings, "bluesky_app_password", "app-password")
    code = share(client)["code"]
    # The search also returns a post linking somewhere else, which is ignored
    fake = FakeBluesky([bluesky_post(code), bluesky_post("someoneelse", rkey="3kzzz")])

    assert sync_bluesky_posts(httpx.MockTransport(fake.handle)) == 1
    assert sync_bluesky_posts(httpx.MockTransport(fake.handle)) == 0

    (posted,) = client.get(SHARES).json()["posted_to"]
    assert posted["platform"] == "bluesky"
    assert posted["post_url"] == "https://bsky.app/profile/did:plc:maya/post/3kabc"
    assert posted["posted_at"].startswith("2025-03-05")
    search = next(r for r in fake.requests if r.url.path.endswith("searchPosts"))
    assert search.url.params["url"] == f"https://pull.example/s/{code}"
    # The shared review shows the badge to everyone
    (review,) = client.get("/api/bills/119/hr/1/reviews").json()["data"]
    assert review["posted_to"] == ["bluesky"]


def test_bluesky_lookup_is_skipped_without_an_account_and_survives_a_bad_one(client, monkeypatch):
    assert sync_bluesky_posts() is None

    monkeypatch.setattr(settings, "bluesky_handle", "pull.bsky.social")
    monkeypatch.setattr(settings, "bluesky_app_password", "wrong")
    fake = FakeBluesky([])
    assert sync_bluesky_posts(httpx.MockTransport(fake.handle)) == 0
