import psycopg
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.district_search import normalize, resolve, state_in, zip_in
from app.main import app
from tests.conftest import TEST_DATABASE_URL

client = TestClient(app)


@pytest.fixture
def census(monkeypatch):
    """Record geocoder calls and answer them with the districts a test sets."""
    calls = []
    answer: dict = {"districts": set()}

    def fake(address):
        calls.append(address)
        if isinstance(answer["districts"], Exception):
            raise answer["districts"]
        return set(answer["districts"])

    monkeypatch.setattr("app.district_search.census_districts", fake)
    return calls, answer


@pytest.mark.parametrize(
    ("query", "zip_code", "state"),
    [
        ("Brooklyn, NY 11201", "11201", "NY"),
        ("12345 Main St, Austin TX 78701-1234", "78701", "TX"),
        ("12345 Main St, Anytown", None, None),
        ("PO Box 12, Boise, ID 83702, USA", "83702", "ID"),
        ("Charleston, West Virginia", None, "WV"),
        ("portland, or", None, "OR"),
        ("100 Main St in", None, None),
        ("wy", None, "WY"),
    ],
)
def test_parser_finds_the_zip_code_and_state(query, zip_code, state):
    text = normalize(query)
    assert zip_in(text) == zip_code
    assert state_in(text) == state


def test_a_zip_code_alone_lists_its_districts_without_the_geocoder(census):
    calls, _ = census
    assert resolve("11201-1234") == ("zip", [("NY", 10), ("NY", 7)])
    assert resolve("Brooklyn, NY 11201")[0] == "zip"
    assert calls == []


def test_a_street_address_uses_the_geocoder_and_keeps_every_district_it_matches(census):
    calls, answer = census
    answer["districts"] = {("NY", 12)}
    assert resolve("350 Fifth Ave, New York, NY 10118") == ("address", [("NY", 12)])
    answer["districts"] = {("NY", 12), ("NY", 10)}
    assert resolve("1 Line St, New York, NY") == ("address", [("NY", 10), ("NY", 12)])
    assert calls == ["350 Fifth Ave, New York, NY 10118", "1 Line St, New York, NY"]


def test_an_unmatched_or_unavailable_address_falls_back_to_its_zip_code_then_state(census):
    _, answer = census
    assert resolve("1 Nowhere Rd, Brooklyn, NY 11201") == ("zip", [("NY", 10), ("NY", 7)])
    answer["districts"] = HTTPException(502, "District lookup is unavailable.")
    source, districts = resolve("1 Nowhere Rd, Albany, NY")
    assert source == "state"
    assert len(districts) == 26


def test_an_outage_is_reported_when_nothing_else_matches(census):
    _, answer = census
    answer["districts"] = HTTPException(502, "District lookup is unavailable.")
    with pytest.raises(HTTPException) as raised:
        resolve("1 Nowhere Rd, Somewhere")
    assert raised.value.status_code == 502


def test_unmatched_text_asks_for_more_detail(census):
    with pytest.raises(HTTPException) as raised:
        resolve("near the park")
    assert raised.value.status_code == 422
    with pytest.raises(HTTPException):
        resolve("00000")


def test_search_lists_each_house_member_and_the_state_senators(db, census):
    with psycopg.connect(TEST_DATABASE_URL) as conn:
        conn.execute(
            "INSERT INTO members (bioguide_id, name, party, state, chamber, district, is_current) "
            "VALUES ('G000599', 'Goldman, Daniel', 'D', 'NY', 'House', 10, true), "
            "('V000081', 'Velazquez, Nydia', 'D', 'NY', 'House', 7, true), "
            "('S000148', 'Schumer, Charles', 'D', 'NY', 'Senate', NULL, true), "
            "('C001098', 'Cruz, Ted', 'R', 'TX', 'Senate', NULL, true)"
        )

    response = client.post("/api/district-search", json={"query": "Brooklyn, NY 11201"})

    assert response.status_code == 200
    body = response.json()
    assert body["source"] == "zip"
    assert [row["representative"]["bioguide_id"] for row in body["districts"]] == [
        "G000599",
        "V000081",
    ]
    assert [senator["bioguide_id"] for senator in body["senators"]] == ["S000148"]
