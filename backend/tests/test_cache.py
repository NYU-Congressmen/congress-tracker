import httpx
import psycopg
import pytest
from fastapi.testclient import TestClient

from alembic import command
from app.config import settings
from app.db import execute_many
from app.main import app
from app.sync.bills import SAVE_BILL_SQL
from app.sync.client import CongressClient
from app.sync.members import SAVE_MEMBER_SQL
from tests.conftest import TEST_DATABASE_URL

BILL_DETAIL = {
    "congress": 119,
    "type": "HR",
    "number": "1",
    "title": "Example Act",
    "introducedDate": "2025-01-03",
    "latestAction": {"actionDate": "2025-07-04", "text": "Became Public Law No: 119-1."},
    "updateDateIncludingText": "2025-07-05T00:00:00Z",
    "policyArea": {"name": "Taxation"},
    "sponsors": [{"bioguideId": "F000001"}],
}

BILL_ACTIONS = [
    {"actionDate": "2025-07-04", "type": "President", "text": "Became Public Law No: 119-1."},
    {"actionDate": "2025-03-01", "type": "Floor", "text": "Passed/agreed to in House: On passage."},
    {"actionDate": "2025-01-03", "type": "IntroReferral", "text": "Introduced in House"},
]

# A sponsor who has left Congress, so the current-member sync never stored them
FORMER_MEMBER = {
    "bioguideId": "F000001",
    "invertedOrderName": "Former, Fran",
    "partyHistory": [{"partyAbbreviation": "R"}],
    "terms": [{"chamber": "House of Representatives", "stateCode": "OH", "district": 4}],
    "currentMember": False,
}

SPONSORED = [
    {
        "congress": 119,
        "type": "HR",
        "number": "2",
        "title": "Second Act",
        "introducedDate": "2025-02-01",
        "latestAction": {"text": "Referred to the Committee."},
    },
    # Amendments have no bill type and are skipped
    {"congress": 119, "amendmentNumber": "7", "title": None},
    # Bills from other Congresses are skipped, even when current ones come after them
    {"congress": 118, "type": "HR", "number": "9", "title": "Old Act"},
    {
        "congress": 119,
        "type": "HR",
        "number": "3",
        "title": "After an older bill",
        "introducedDate": "2025-01-15",
    },
]


class FakeCongress:
    """Serve canned Congress.gov responses and record every path requested."""

    def __init__(self):
        self.paths = []
        self.down = False

    def handle(self, request: httpx.Request) -> httpx.Response:
        """Return the canned response for a request, or raise when the API is marked down."""
        if self.down:
            raise httpx.ConnectError("Congress.gov is down", request=request)
        path = request.url.path.removeprefix("/v3")
        self.paths.append(path)
        responses = {
            "/bill/119/hr/1": {"bill": BILL_DETAIL},
            "/bill/119/hr/1/actions": {"actions": BILL_ACTIONS, "pagination": {}},
            "/member/F000001": {"member": FORMER_MEMBER},
            "/member/A000001/sponsored-legislation": {
                "sponsoredLegislation": SPONSORED,
                "pagination": {},
            },
        }
        if path not in responses:
            return httpx.Response(404, json={"error": "not found"})
        return httpx.Response(200, json=responses[path])


@pytest.fixture
def api(db, monkeypatch):
    """Return a test client whose Congress.gov calls go to a fake and the fake itself."""
    fake = FakeCongress()

    def client_factory(key):
        return CongressClient(key, transport=httpx.MockTransport(fake.handle))

    monkeypatch.setattr(settings, "congress_api_key", "test-key")
    monkeypatch.setattr("app.routes.bills.CongressClient", client_factory)
    monkeypatch.setattr("app.routes.members.CongressClient", client_factory)
    return TestClient(app), fake


def sql(statement: str) -> None:
    """Run one statement against the test database."""
    with psycopg.connect(TEST_DATABASE_URL) as conn:
        conn.execute(statement)


def test_bill_detail_is_fetched_once_and_cached(api):
    client, fake = api
    body = client.get("/api/bills/119/hr/1").json()

    assert body["status"] == "became_law"
    assert body["policy_area"] == "Taxation"
    assert body["sponsor"]["name"] == "Former, Fran"
    assert [a["action_date"] for a in body["actions"]] == ["2025-07-04", "2025-03-01", "2025-01-03"]
    # The former sponsor is stored for the foreign key but stays out of the current list
    assert client.get("/api/members").json()["total"] == 0

    calls = len(fake.paths)
    assert client.get("/api/bills/119/hr/1").status_code == 200
    assert len(fake.paths) == calls


def test_changed_bill_is_fetched_again(api):
    client, fake = api
    client.get("/api/bills/119/hr/1")
    calls = len(fake.paths)
    sql("UPDATE bills SET update_date = details_synced_at + interval '1 hour'")

    client.get("/api/bills/119/hr/1")
    assert len(fake.paths) > calls
    # Replacing the actions must not duplicate them
    assert len(client.get("/api/bills/119/hr/1").json()["actions"]) == 3


def test_cached_bill_is_served_when_the_api_is_down(api):
    client, fake = api
    client.get("/api/bills/119/hr/1")
    sql("UPDATE bills SET details_synced_at = NULL")
    fake.down = True

    response = client.get("/api/bills/119/hr/1")
    assert response.status_code == 200
    assert response.json()["title"] == "Example Act"


def test_unknown_bill_returns_404(api):
    client, _ = api
    assert client.get("/api/bills/119/hr/999").status_code == 404


def test_list_sync_never_moves_a_bill_backwards(db):
    row = {
        "bill_id": "119-hr-5",
        "congress": 119,
        "type": "hr",
        "number": 5,
        "title": "T",
        "introduced_date": None,
        "latest_action_date": None,
        "latest_action_text": None,
        "update_date": None,
    }
    execute_many(SAVE_BILL_SQL, [{**row, "status": "passed_house"}])
    execute_many(SAVE_BILL_SQL, [{**row, "status": "committee"}])
    with psycopg.connect(TEST_DATABASE_URL) as conn:
        status = conn.execute("SELECT status FROM bills WHERE bill_id = '119-hr-5'").fetchone()[0]
    assert status == "passed_house"


def test_member_profile_caches_current_sponsored_bills(api):
    client, fake = api
    execute_many(
        SAVE_MEMBER_SQL,
        [
            {
                "bioguide_id": "A000001",
                "name": "Active, Al",
                "party": "D",
                "state": "NY",
                "chamber": "House",
                "district": 1,
                "image_url": None,
                "is_current": True,
            }
        ],
    )
    body = client.get("/api/members/A000001").json()
    assert [b["bill_id"] for b in body["sponsored_bills"]] == ["119-hr-2", "119-hr-3"]

    calls = len(fake.paths)
    client.get("/api/members/a000001")
    assert len(fake.paths) == calls


def test_unknown_member_returns_404(api):
    client, _ = api
    assert client.get("/api/members/Z999999").status_code == 404


def test_migrations_downgrade_and_upgrade_cleanly(db):
    command.downgrade(db, "base")
    command.upgrade(db, "head")
