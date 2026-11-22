import httpx
import psycopg
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.sync.client import CongressClient
from app.sync.votes import house_votes_from_actions, sync_followed_votes
from tests.conftest import TEST_DATABASE_URL

URL = "/api/bills/119/hr/1/house-votes"

HOUSE_VOTE = {
    "chamber": "House",
    "congress": 119,
    "sessionNumber": 1,
    "rollNumber": 17,
    "date": "2025-01-16T16:00:00Z",
    "url": "https://clerk.house.gov/evs/2025/roll017.xml",
}

ACTIONS = [
    {
        "actionDate": "2025-03-01",
        "text": "Passed Senate.",
        "recordedVotes": [
            {"chamber": "Senate", "congress": 119, "sessionNumber": 1, "rollNumber": 40}
        ],
    },
    {"actionDate": "2025-01-16", "text": "On passage Passed.", "recordedVotes": [HOUSE_VOTE]},
    # The same vote appears again under a second action on the same day
    {"actionDate": "2025-01-16", "text": "Motion to reconsider.", "recordedVotes": [HOUSE_VOTE]},
    {"actionDate": "2025-01-03", "text": "Introduced in House"},
]

MEMBERS = [
    {"bioguideID": "A000001", "voteCast": "Yea", "voteParty": "D", "voteState": "NY"},
    {"bioguideID": "B000002", "voteCast": "Nay", "voteParty": "R", "voteState": "TX"},
    {"bioguideId": "C000003", "voteCast": "Yea", "voteParty": "R", "voteState": "OH"},
]


class FakeCongress:
    """Serve a bill's actions and a vote's members in pages of two, recording each path."""

    def __init__(self):
        self.paths = []
        self.members_down = False
        self.ignore_offset = False

    def handle(self, request: httpx.Request) -> httpx.Response:
        path = request.url.path.removeprefix("/v3")
        self.paths.append(path)
        if path == "/bill/119/hr/1/actions":
            return httpx.Response(200, json={"actions": ACTIONS, "pagination": {}})
        if path == "/house-vote/119/1/17/members":
            if self.members_down:
                raise httpx.ConnectError("Congress.gov is down", request=request)
            offset = 0 if self.ignore_offset else int(request.url.params["offset"])
            limit = int(request.url.params["limit"])
            return httpx.Response(
                200,
                json={
                    "houseRollCallVoteMemberVotes": {
                        "congress": 119,
                        "sessionNumber": 1,
                        "rollCallNumber": 17,
                        "voteQuestion": "On Passage",
                        "result": "Passed",
                        "voteType": "Yea-and-Nay",
                        "results": MEMBERS[offset : offset + limit],
                    }
                },
            )
        return httpx.Response(404, json={"error": "not found"})


def sql(statement: str, params: tuple = ()) -> None:
    with psycopg.connect(TEST_DATABASE_URL) as conn:
        conn.execute(statement, params)


@pytest.fixture
def fake(db, monkeypatch):
    """Store a reviewed bill and a current member, and page vote members two at a time."""
    monkeypatch.setattr("app.sync.votes.PAGE_SIZE", 2)
    sql(
        "INSERT INTO bills (bill_id, congress, type, number, title, update_date) "
        "VALUES ('119-hr-1', 119, 'hr', 1, 'Example Act', '2025-03-02T00:00:00Z')"
    )
    sql(
        "INSERT INTO members (bioguide_id, name, party, state, chamber, district, is_current) "
        "VALUES ('A000001', 'Early, Eve', 'D', 'NY', 'House', 12, true)"
    )
    sql("INSERT INTO users (uid, phone) VALUES ('user-1', '+15550000001')")
    sql("INSERT INTO reviews (uid, bill_id, stance) VALUES ('user-1', '119-hr-1', 'support')")
    return FakeCongress()


def run_sync(fake: FakeCongress) -> int:
    with CongressClient("test-key", transport=httpx.MockTransport(fake.handle)) as client:
        return sync_followed_votes(client)


def test_only_house_votes_are_taken_from_actions_once_each():
    votes = house_votes_from_actions("119-hr-1", ACTIONS)

    assert [(v["congress"], v["session"], v["roll_number"]) for v in votes] == [(119, 1, 17)]
    assert votes[0]["source_url"].endswith("roll017.xml")


def test_sync_stores_every_position_as_recorded(fake):
    assert run_sync(fake) == 1

    (vote,) = TestClient(app).get(URL).json()
    assert (vote["question"], vote["result"]) == ("On Passage", "Passed")
    assert vote["positions_complete"] is True
    assert vote["totals"] == {"Yea": 2, "Nay": 1}
    assert {p["bioguide_id"]: p["position"] for p in vote["positions"]} == {
        "A000001": "Yea",
        "B000002": "Nay",
        "C000003": "Yea",
    }
    # Members Pull has stored get their name and district
    eve = next(p for p in vote["positions"] if p["bioguide_id"] == "A000001")
    assert (eve["name"], eve["district"]) == ("Early, Eve", 12)


def test_one_members_position_keeps_the_full_totals(fake):
    run_sync(fake)

    (vote,) = TestClient(app).get(URL, params={"bioguide_id": "b000002"}).json()

    assert [p["position"] for p in vote["positions"]] == ["Nay"]
    assert vote["totals"] == {"Yea": 2, "Nay": 1}


def test_a_quiet_day_costs_no_requests(fake):
    run_sync(fake)
    requests = len(fake.paths)

    assert run_sync(fake) == 0
    assert len(fake.paths) == requests


def test_a_changed_bill_has_its_actions_read_again(fake):
    run_sync(fake)
    sql("UPDATE bills SET update_date = '2025-04-01T00:00:00Z'")

    run_sync(fake)

    assert fake.paths.count("/bill/119/hr/1/actions") == 2
    # The positions were already stored and votes never change
    assert fake.paths.count("/house-vote/119/1/17/members") == 2


def test_a_failed_vote_stays_pending_and_is_retried(fake):
    fake.members_down = True
    assert run_sync(fake) == 0
    (vote,) = TestClient(app).get(URL).json()
    assert vote["positions_complete"] is False
    assert (vote["totals"], vote["positions"]) == ({}, [])

    fake.members_down = False
    assert run_sync(fake) == 1


def test_a_repeated_page_leaves_the_vote_pending_until_the_next_sync(fake):
    fake.ignore_offset = True

    assert run_sync(fake) == 0

    (vote,) = TestClient(app).get(URL).json()
    assert vote["positions_complete"] is False
    assert vote["totals"] == {}
    fake.ignore_offset = False
    assert run_sync(fake) == 1
    (vote,) = TestClient(app).get(URL).json()
    assert vote["positions_complete"] is True
    assert vote["totals"] == {"Yea": 2, "Nay": 1}


def test_bills_nobody_follows_are_left_alone(fake):
    sql("DELETE FROM reviews")

    assert run_sync(fake) == 0
    assert fake.paths == []


def test_house_votes_of_an_unknown_bill_are_404(fake):
    client = TestClient(app)
    assert client.get("/api/bills/119/hr/999/house-votes").status_code == 404
    assert client.get(URL, params={"bioguide_id": "nope"}).status_code == 422
