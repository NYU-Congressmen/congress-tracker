import httpx
import psycopg
from fastapi.testclient import TestClient

from app.main import app
from app.sync.client import CongressClient
from app.sync.members import SAVE_MEMBER_SQL, clean_contact, clean_member, sync_contacts
from tests.conftest import TEST_DATABASE_URL

HOUSE_MEMBER = {
    "bioguideId": "W000832",
    "name": "Wahab, Aisha",
    "partyName": "Democratic",
    "state": "California",
    "district": 14,
    "depiction": {"imageUrl": "https://example.test/w.jpg"},
    "terms": {"item": [{"chamber": "House of Representatives", "startYear": 2025}]},
    "updateDate": "2025-08-13T10:41:39Z",
}

# Senators have no district, and this one has no photo
SENATOR = {
    "bioguideId": "S000148",
    "name": "Schumer, Charles E.",
    "partyName": "Democratic",
    "state": "New York",
    "terms": {"item": [{"chamber": "Senate", "startYear": 1999}]},
}


def test_clean_house_member():
    assert clean_member(HOUSE_MEMBER) == {
        "bioguide_id": "W000832",
        "name": "Wahab, Aisha",
        "party": "D",
        "state": "CA",
        "chamber": "House",
        "district": 14,
        "image_url": "https://example.test/w.jpg",
        "is_current": True,
        "update_date": "2025-08-13T10:41:39Z",
    }


def test_clean_senator_without_district_or_photo():
    row = clean_member(SENATOR)
    assert row["chamber"] == "Senate"
    assert row["state"] == "NY"
    assert row["district"] is None
    assert row["image_url"] is None


# Trimmed from a real /member/S000148 response
SCHUMER_DETAIL = {
    "bioguideId": "S000148",
    "addressInformation": {
        "officeAddress": "322 Hart Senate Office Building  Washington, DC 20510",
        "phoneNumber": "(202) 224-6542",
    },
    "officialWebsiteUrl": "https://www.schumer.senate.gov/",
}


def test_clean_contact():
    assert clean_contact(SCHUMER_DETAIL) == {
        "bioguide_id": "S000148",
        "office_phone": "(202) 224-6542",
        "office_address": "322 Hart Senate Office Building  Washington, DC 20510",
        "website_url": "https://www.schumer.senate.gov/",
    }


def test_contacts_are_fetched_only_when_the_member_changed(db):
    with psycopg.connect(TEST_DATABASE_URL) as conn:
        row = {**clean_member(SENATOR), "update_date": "2026-01-01T00:00:00Z"}
        conn.execute(SAVE_MEMBER_SQL, row)
    requested = []

    def fake_api(request: httpx.Request) -> httpx.Response:
        requested.append(request.url.path)
        return httpx.Response(200, json={"member": SCHUMER_DETAIL})

    with CongressClient("test-key", transport=httpx.MockTransport(fake_api)) as client:
        assert sync_contacts(client) == 1  # never fetched, so fetched now
        assert sync_contacts(client) == 0  # unchanged since, so skipped
        with psycopg.connect(TEST_DATABASE_URL) as conn:
            conn.execute("UPDATE members SET update_date = '2026-02-01T00:00:00Z'")
        assert sync_contacts(client) == 1  # its record changed, so fetched again
    assert requested == ["/v3/member/S000148", "/v3/member/S000148"]

    with psycopg.connect(TEST_DATABASE_URL) as conn:
        phone = conn.execute("SELECT office_phone FROM members").fetchone()[0]
    assert phone == "(202) 224-6542"
    member = TestClient(app).get("/api/members", params={"state": "NY"}).json()["data"][0]
    assert member["office_phone"] == "(202) 224-6542"
    assert member["website_url"] == "https://www.schumer.senate.gov/"
