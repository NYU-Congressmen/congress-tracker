import httpx
import psycopg
import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.main import app
from app.sync.client import CongressClient
from app.sync.graph import sync_followed_graphs
from tests.conftest import TEST_DATABASE_URL

URL = "/api/bills/119/hr/1/graph"

COSPONSORS = [
    {
        "bioguideId": "B000002",
        "fullName": "Rep. Later, Lee [R-TX-5]",
        "party": "R",
        "state": "TX",
        "district": "5",
        "sponsorshipDate": "2025-02-10",
        "isOriginalCosponsor": False,
    },
    {
        "bioguideId": "A000001",
        "fullName": "Rep. Early, Eve [D-NY-12]",
        "party": "D",
        "state": "NY",
        "district": 12,
        "sponsorshipDate": "2025-01-03",
        "isOriginalCosponsor": True,
    },
    {
        "bioguideId": "C000003",
        "fullName": "Sen. Gone, Gil [D-OH]",
        "party": "D",
        "state": "OH",
        "sponsorshipDate": "2025-01-03",
        "isOriginalCosponsor": "True",
        "sponsorshipWithdrawnDate": "2025-03-01",
    },
]

COMMITTEES = [
    {
        "systemCode": "hsif00",
        "name": "Energy and Commerce Committee",
        "chamber": "House",
        "type": "Standing",
        "activities": [
            {"name": "Referred to", "date": "2025-01-03T15:00:00Z"},
            {"name": "Markup by", "date": "2025-04-02T15:00:00Z"},
        ],
        "subcommittees": [
            {
                "systemCode": "hsif14",
                "name": "Health Subcommittee",
                "activities": [{"name": "Referred to", "date": "2025-01-10T15:00:00Z"}],
            }
        ],
    }
]

RELATED = [
    {
        "congress": 119,
        "type": "S",
        "number": "20",
        "title": "Companion Act",
        "latestAction": {"actionDate": "2025-02-01", "text": "Read twice."},
        "relationshipDetails": [
            {"type": "Identical bill", "identifiedBy": "CRS"},
            {"type": "Related bill", "identifiedBy": "House"},
            # A machine code that would read as if the companion itself became law
            {"type": "SecondaryCompanionBillBecameLaw", "identifiedBy": "CRS"},
        ],
    },
    {"congress": 118, "type": "HR", "number": "77", "title": "Older Act"},
]


class FakeCongress:
    """Serve canned graph responses, two cosponsor pages, and record every path requested."""

    def __init__(self):
        self.paths = []
        self.down = False

    def handle(self, request: httpx.Request) -> httpx.Response:
        """Return the canned response for a request, or raise when the API is marked down."""
        path = request.url.path.removeprefix("/v3")
        self.paths.append(path)
        if self.down:
            raise httpx.ConnectError("Congress.gov is down", request=request)
        for number in (1, 2):
            base = f"/bill/119/hr/{number}"
            if path == f"{base}/cosponsors":
                # The first page points to a second, the way Congress.gov pages long lists
                if request.url.params.get("offset", "0") == "0":
                    return httpx.Response(
                        200,
                        json={"cosponsors": COSPONSORS[:2], "pagination": {"next": "page-2"}},
                    )
                return httpx.Response(200, json={"cosponsors": COSPONSORS[2:], "pagination": {}})
            if path == f"{base}/committees":
                return httpx.Response(200, json={"committees": COMMITTEES})
            if path == f"{base}/relatedbills":
                return httpx.Response(200, json={"relatedBills": RELATED, "pagination": {}})
        return httpx.Response(404, json={"error": "not found"})


def client_factory(fake):
    def make(key, **kwargs):
        return CongressClient(key, transport=httpx.MockTransport(fake.handle), **kwargs)

    return make


def add_bill(number: int, update_date: str = "2025-05-01T00:00:00Z") -> None:
    with psycopg.connect(TEST_DATABASE_URL) as conn:
        conn.execute(
            "INSERT INTO bills (bill_id, congress, type, number, title, update_date) "
            "VALUES (%s, 119, 'hr', %s, 'Example Act', %s)",
            (f"119-hr-{number}", number, update_date),
        )


def sql(statement: str) -> None:
    with psycopg.connect(TEST_DATABASE_URL) as conn:
        conn.execute(statement)


@pytest.fixture
def api(db, monkeypatch):
    """Return a test client whose Congress.gov calls go to a fake, and the fake itself."""
    fake = FakeCongress()
    monkeypatch.setattr(settings, "congress_api_key", "test-key")
    monkeypatch.setattr("app.routes.graph.CongressClient", client_factory(fake))
    add_bill(1)
    return TestClient(app), fake


def test_graph_is_fetched_once_and_stored(api):
    client, fake = api

    body = client.get(URL).json()

    assert [c["bioguide_id"] for c in body["cosponsors"]] == ["A000001", "B000002", "C000003"]
    assert body["cosponsors"][1]["district"] == 5
    assert body["cosponsors"][2]["is_original"] is True
    assert body["cosponsors"][2]["withdrawn_date"] == "2025-03-01"
    committee, subcommittee = body["committees"]
    assert committee["latest_activity"] == "Markup by"
    assert subcommittee["parent_code"] == "hsif00"
    assert subcommittee["chamber"] == "House"
    assert subcommittee["type"] == "Subcommittee"
    companion, older = body["related_bills"]
    assert companion["bill_id"] == "119-s-20"
    assert companion["relationship"] == "Identical bill; Related bill"
    assert companion["identified_by"] == "CRS, House"
    assert older["relationship"] == "Related bill"
    assert (companion["stored"], older["stored"]) == (False, False)
    assert body["cache"]["complete"] is True
    assert body["cache"]["stale"] is False

    requests = len(fake.paths)
    assert client.get(URL).status_code == 200
    assert len(fake.paths) == requests


def test_changed_bill_fetches_its_graph_again(api):
    client, fake = api
    client.get(URL)
    sql("UPDATE bills SET update_date = '2025-06-01T00:00:00Z' WHERE bill_id = '119-hr-1'")

    requests = len(fake.paths)
    assert client.get(URL).json()["cache"]["stale"] is False
    assert len(fake.paths) > requests


def test_failed_refresh_keeps_the_stored_graph_and_cools_down(api):
    client, fake = api
    client.get(URL)
    sql("UPDATE bills SET update_date = '2025-06-01T00:00:00Z' WHERE bill_id = '119-hr-1'")
    fake.down = True

    body = client.get(URL).json()

    assert len(body["cosponsors"]) == 3
    assert body["cache"]["stale"] is True
    assert body["cache"]["refresh_failed"] is True
    requests = len(fake.paths)
    client.get(URL)
    assert len(fake.paths) == requests


def test_unfetched_graph_without_a_key_makes_no_requests(api, monkeypatch):
    client, fake = api
    monkeypatch.setattr(settings, "congress_api_key", None)

    body = client.get(URL).json()

    assert fake.paths == []
    assert body["cosponsors"] == []
    assert body["cache"]["complete"] is False


def test_unknown_bill_is_404(api):
    client, _ = api
    assert client.get("/api/bills/119/hr/999/graph").status_code == 404


def test_related_bill_shows_whether_it_is_stored(api):
    client, _ = api
    with psycopg.connect(TEST_DATABASE_URL) as conn:
        conn.execute(
            "INSERT INTO bills (bill_id, congress, type, number, title) "
            "VALUES ('119-s-20', 119, 's', 20, 'Companion Act')"
        )

    assert client.get(URL).json()["related_bills"][0]["stored"] is True


def test_daily_sync_fetches_only_followed_bills_that_changed(db):
    fake = FakeCongress()
    add_bill(1)
    add_bill(2)
    sql("INSERT INTO users (uid, phone) VALUES ('user-1', '+15550000001')")
    sql("INSERT INTO reviews (uid, bill_id, stance) VALUES ('user-1', '119-hr-2', 'support')")

    with CongressClient("test-key", transport=httpx.MockTransport(fake.handle)) as client:
        assert sync_followed_graphs(client) == 1
        assert all(path.startswith("/bill/119/hr/2/") for path in fake.paths)
        # Nothing changed, so the second run makes no requests
        requests = len(fake.paths)
        assert sync_followed_graphs(client) == 0
        assert len(fake.paths) == requests
