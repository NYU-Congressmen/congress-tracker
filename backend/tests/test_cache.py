import httpx
import psycopg
import pytest
from fastapi.testclient import TestClient

from alembic import command
from app.config import settings
from app.db import execute_many
from app.main import app
from app.sync.bills import SAVE_BILL_SQL, clean_bill
from app.sync.cache import SAVE_DETAIL_SQL, SAVE_SPONSORED_SQL
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

TEXT_VERSIONS = [
    {
        "type": "Introduced in House",
        "date": "2025-01-03T05:00:00Z",
        "formats": [
            {
                "type": "Formatted Text",
                "url": "https://www.congress.gov/119/bills/hr1/BILLS-119hr1ih.htm",
            }
        ],
    }
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
        path = request.url.path.removeprefix("/v3")
        self.paths.append(path)
        if self.down:
            raise httpx.ConnectError("Congress.gov is down", request=request)
        responses = {
            "/bill/119/hr/1": {"bill": BILL_DETAIL},
            "/bill/119/hr/1/actions": {"actions": BILL_ACTIONS, "pagination": {}},
            "/bill/119/hr/1/text": {"textVersions": TEXT_VERSIONS, "pagination": {}},
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

    def client_factory(key, **kwargs):
        return CongressClient(key, transport=httpx.MockTransport(fake.handle), **kwargs)

    monkeypatch.setattr(settings, "congress_api_key", "test-key")
    monkeypatch.setattr("app.routes.bills.CongressClient", client_factory)
    monkeypatch.setattr("app.routes.members.CongressClient", client_factory)
    # The not-found memory lives in the module, so each test starts with it empty
    monkeypatch.setattr("app.sync.cache._not_found", {})
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


def test_changed_bill_is_fetched_again(api, monkeypatch):
    client, fake = api
    client.get("/api/bills/119/hr/1")
    calls = len(fake.paths)
    # A delayed upstream update can be newer than the cached version but older than local time.
    sql("UPDATE bills SET update_date = details_update_date + interval '1 hour'")
    monkeypatch.setitem(BILL_DETAIL, "updateDateIncludingText", "2025-07-05T01:00:00Z")

    client.get("/api/bills/119/hr/1")
    assert len(fake.paths) > calls
    # Replacing the actions must not duplicate them
    assert len(client.get("/api/bills/119/hr/1").json()["actions"]) == 3
    calls = len(fake.paths)
    client.get("/api/bills/119/hr/1")
    assert len(fake.paths) == calls


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


def test_unknown_bill_is_not_requested_again_soon(api):
    client, fake = api
    client.get("/api/bills/119/hr/999")
    calls = len(fake.paths)

    assert client.get("/api/bills/119/hr/999").status_code == 404
    assert len(fake.paths) == calls


def test_uncached_bill_returns_502_when_upstream_is_unavailable(api):
    client, fake = api
    fake.down = True
    assert client.get("/api/bills/119/hr/1").status_code == 502


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
        "passed_house": True,
        "passed_senate": False,
    }
    execute_many(SAVE_BILL_SQL, [{**row, "status": "passed_one_chamber"}])
    execute_many(SAVE_BILL_SQL, [{**row, "status": "committee", "passed_house": False}])
    with psycopg.connect(TEST_DATABASE_URL) as conn:
        status = conn.execute("SELECT status FROM bills WHERE bill_id = '119-hr-5'").fetchone()[0]
    assert status == "passed_one_chamber"


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


def seed_member():
    """Store a current member for sponsorship and profile tests."""
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


def test_actions_keep_upstream_sequence_on_the_same_day(api, monkeypatch):
    client, _ = api
    actions = [
        BILL_ACTIONS[0],
        {
            "actionDate": "2025-07-04",
            "type": "President",
            "text": "Signed by President.",
        },
        *BILL_ACTIONS[1:],
    ]
    monkeypatch.setattr("tests.test_cache.BILL_ACTIONS", actions)
    body = client.get("/api/bills/119/hr/1").json()
    assert [a["text"] for a in body["actions"]] == [a["text"] for a in actions]


def test_bill_failure_reports_stale_cache_and_delays_retry(api):
    client, fake = api
    first = client.get("/api/bills/119/hr/1").json()
    assert first["cache"]["complete"] is True
    assert first["cache"]["stale"] is False
    sql("UPDATE bills SET update_date = details_update_date + interval '1 hour'")
    fake.down = True
    body = client.get("/api/bills/119/hr/1").json()
    assert body["cache"]["complete"] is True
    assert body["cache"]["stale"] is True
    assert body["cache"]["refresh_failed"] is True
    assert body["cache"]["retry_after"] is not None
    assert body["actions"] == first["actions"]
    calls = len(fake.paths)
    assert client.get("/api/bills/119/hr/1").status_code == 200
    assert len(fake.paths) == calls
    sql("UPDATE bills SET details_retry_after = now() - interval '1 second'")
    fake.down = False
    body = client.get("/api/bills/119/hr/1").json()
    assert len(fake.paths) > calls
    assert body["cache"]["refresh_failed"] is False
    assert body["cache"]["retry_after"] is None


def test_summary_fallback_is_distinguished_from_complete_history(api):
    client, fake = api
    execute_many(SAVE_BILL_SQL, [clean_bill(BILL_DETAIL)])
    fake.down = True
    response = client.get("/api/bills/119/hr/1")
    assert response.status_code == 200
    assert response.json()["cache"]["complete"] is False
    assert response.json()["cache"]["refresh_failed"] is True
    assert response.json()["actions"] == []


def test_bill_and_member_without_key_never_call_upstream(api, monkeypatch):
    client, fake = api
    seed_member()
    execute_many(SAVE_BILL_SQL, [clean_bill(BILL_DETAIL)])
    monkeypatch.setattr(settings, "congress_api_key", None)
    bill = client.get("/api/bills/119/hr/1").json()
    member = client.get("/api/members/A000001").json()
    assert bill["cache"]["complete"] is False
    assert member["cache"]["complete"] is False
    assert bill["cache"]["refresh_failed"] is False
    assert client.get("/api/bills/119/hr/999").status_code == 404
    assert fake.paths == []


def test_member_profile_excludes_historical_bills(api):
    client, _ = api
    seed_member()
    historical = clean_bill({**BILL_DETAIL, "congress": 118})
    execute_many(SAVE_SPONSORED_SQL, [{**historical, "sponsor_id": "A000001"}])
    body = client.get("/api/members/A000001").json()
    assert {b["congress"] for b in body["sponsored_bills"]} == {119}


def test_member_failure_preserves_daily_cache_and_cools_down(api):
    client, fake = api
    seed_member()
    first = client.get("/api/members/A000001").json()
    sql("UPDATE members SET sponsored_synced_at = now() - interval '2 days'")
    fake.down = True
    body = client.get("/api/members/A000001").json()
    assert body["sponsored_bills"] == first["sponsored_bills"]
    assert body["cache"]["complete"] is True
    assert body["cache"]["stale"] is True
    assert body["cache"]["refresh_failed"] is True
    calls = len(fake.paths)
    client.get("/api/members/A000001")
    assert len(fake.paths) == calls
    sql("UPDATE members SET sponsored_retry_after = now() - interval '1 second'")
    fake.down = False
    body = client.get("/api/members/A000001").json()
    assert body["cache"]["refresh_failed"] is False
    assert body["cache"]["stale"] is False


@pytest.mark.parametrize("sql_statement", [SAVE_BILL_SQL, SAVE_DETAIL_SQL, SAVE_SPONSORED_SQL])
@pytest.mark.parametrize("first_chamber", ["House", "Senate"])
def test_upserts_accumulate_passage_in_either_order(db, sql_statement, first_chamber):
    other = "Senate" if first_chamber == "House" else "House"
    for chamber in (first_chamber, other):
        row = clean_bill(
            {
                **BILL_DETAIL,
                "latestAction": {
                    "text": f"Passed/agreed to in {chamber}: On passage.",
                },
            }
        )
        execute_many(sql_statement, [{**row, "policy_area": None, "sponsor_id": None}])
    with psycopg.connect(TEST_DATABASE_URL) as conn:
        row = conn.execute("SELECT status, passed_house, passed_senate FROM bills").fetchone()
    assert row == ("passed_both_chambers", True, True)


@pytest.mark.parametrize("sql_statement", [SAVE_BILL_SQL, SAVE_DETAIL_SQL, SAVE_SPONSORED_SQL])
def test_upserts_preserve_enacted_stage(db, sql_statement):
    row = {**clean_bill(BILL_DETAIL), "policy_area": None, "sponsor_id": None}
    execute_many(sql_statement, [row])
    earlier = clean_bill({**BILL_DETAIL, "latestAction": {"text": "Referred to committee."}})
    execute_many(sql_statement, [{**earlier, "policy_area": None, "sponsor_id": None}])
    with psycopg.connect(TEST_DATABASE_URL) as conn:
        assert conn.execute("SELECT status FROM bills").fetchone()[0] == "became_law"


def test_bill_search_pagination_has_a_stable_tie_breaker(api):
    client, _ = api
    # Insert in the opposite order from the promised secondary sort.
    for number in (3, 2, 1):
        execute_many(SAVE_BILL_SQL, [clean_bill({**BILL_DETAIL, "number": number})])
    pages = [client.get(f"/api/bills?limit=1&page={page}").json() for page in (1, 2, 3)]
    assert [page["data"][0]["bill_id"] for page in pages] == ["119-hr-1", "119-hr-2", "119-hr-3"]
    assert all(page["total"] == 3 for page in pages)


def test_status_migration_preserves_records_and_converts_legacy_milestones(db):
    command.downgrade(db, "803cfe036e6c")
    sql(
        "INSERT INTO bills (bill_id, congress, type, number, title, status)"
        " VALUES ('119-s-1', 119, 's', 1, 'Existing bill', 'passed_senate')"
    )
    command.upgrade(db, "head")
    with psycopg.connect(TEST_DATABASE_URL) as conn:
        row = conn.execute(
            "SELECT title, status, passed_house, passed_senate FROM bills"
        ).fetchone()
    assert row == ("Existing bill", "passed_one_chamber", False, True)
    command.downgrade(db, "803cfe036e6c")
    with psycopg.connect(TEST_DATABASE_URL) as conn:
        assert conn.execute("SELECT status FROM bills").fetchone()[0] == "passed_senate"
    command.upgrade(db, "head")


def test_failed_action_write_rolls_back_bill_and_new_sponsor(api, monkeypatch):
    client, _ = api
    monkeypatch.setitem(BILL_ACTIONS[0], "actionDate", "not-a-date")
    with pytest.raises(psycopg.errors.InvalidDatetimeFormat):
        client.get("/api/bills/119/hr/1")
    with psycopg.connect(TEST_DATABASE_URL) as conn:
        for table in ("members", "bills", "bill_actions"):
            assert conn.execute(f"SELECT count(*) FROM {table}").fetchone()[0] == 0


def test_opening_a_bill_stores_its_text_versions_without_their_text(api):
    client, _ = api
    client.get("/api/bills/119/hr/1")
    with psycopg.connect(TEST_DATABASE_URL) as conn:
        rows = conn.execute("SELECT version_type, text_url, text FROM text_versions").fetchall()
    # Only the list is stored on opening; the text itself is downloaded when it is needed
    assert rows == [
        ("Introduced in House", "https://www.congress.gov/119/bills/hr1/BILLS-119hr1ih.htm", None)
    ]
