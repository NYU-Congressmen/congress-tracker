from types import SimpleNamespace

import psycopg
import pytest
from fastapi.testclient import TestClient

from app.ai.embeddings import DIMENSIONS, backfill
from app.main import app
from app.routes.feed import keyword_pattern
from tests.conftest import TEST_DATABASE_URL

client = TestClient(app)


def add_bill(conn, number: int, title: str, latest: str, summary: str | None = None) -> None:
    """Insert one bill, with a CRS summary when one is given."""
    bill_id = f"119-hr-{number}"
    conn.execute(
        """
        INSERT INTO bills (bill_id, congress, type, number, title, status, latest_action_date)
        VALUES (%s, 119, 'hr', %s, %s, 'introduced', %s)
        """,
        (bill_id, number, title, latest),
    )
    if summary:
        conn.execute(
            "INSERT INTO bill_summaries (bill_id, version_code, text) VALUES (%s, '00', %s)",
            (bill_id, summary),
        )


@pytest.fixture
def issues(db):
    """Add sample bills and return the seeded issue ids by name."""
    with psycopg.connect(TEST_DATABASE_URL) as conn:
        add_bill(conn, 1, "AI-Related Job Impacts Clarity Act", "2026-06-18")
        add_bill(conn, 2, "Rural Roads Act", "2026-07-01", "<p>Funds housing near roads.</p>")
        add_bill(conn, 3, "A bill he said was about raids", "2026-08-01")
        add_bill(conn, 4, "Affordable Housing Act", "2026-09-01")
    return {issue["name"]: issue["issue_id"] for issue in client.get("/api/issues").json()}


def titles(response) -> list[str]:
    """Return the bill titles in a feed response."""
    return [bill["title"] for bill in response.json()["data"]]


def test_issues_are_listed_alphabetically(issues):
    names = list(issues)

    assert names == sorted(names)
    assert "Technology and AI" in names


def test_issue_list_hides_the_keywords(issues):
    assert set(client.get("/api/issues").json()[0]) == {"issue_id", "name"}


def test_feed_matches_titles_and_summaries_newest_action_first(issues):
    response = client.get("/api/feed", params={"issue_id": issues["Housing"]})

    assert response.status_code == 200
    assert response.json()["total"] == 2
    assert titles(response) == ["Affordable Housing Act", "Rural Roads Act"]


def test_short_keywords_match_whole_words_only(issues):
    response = client.get("/api/feed", params={"issue_id": issues["Technology and AI"]})

    assert titles(response) == ["AI-Related Job Impacts Clarity Act"]


def test_feed_combines_several_issues_and_pages(issues):
    chosen = [issues["Housing"], issues["Jobs and wages"]]

    first = client.get("/api/feed", params={"issue_id": chosen, "limit": 2})
    second = client.get("/api/feed", params={"issue_id": chosen, "limit": 2, "page": 2})

    assert first.json()["total"] == 3
    assert titles(first) == ["Affordable Housing Act", "Rural Roads Act"]
    assert titles(second) == ["AI-Related Job Impacts Clarity Act"]


def test_unknown_issue_is_rejected(issues):
    response = client.get("/api/feed", params={"issue_id": 999999})

    assert response.status_code == 404
    assert "999999" in response.json()["detail"]


def test_feed_requires_an_issue(issues):
    assert client.get("/api/feed").status_code == 422


def test_keyword_pattern_escapes_special_characters():
    assert keyword_pattern(["a.b", "c"]) == r"\y(a\.b|c)\y"


@pytest.fixture
def saved_embeddings(issues):
    """Provide topic IDs and clear the saved topic vectors after the test."""
    yield issues
    with psycopg.connect(TEST_DATABASE_URL) as conn:
        conn.execute("DELETE FROM issue_embeddings")


def test_backfill_ranks_the_feed_and_refreshes_a_changed_summary(saved_embeddings):
    calls = []

    def create(**request):
        calls.append(request["input"])
        rows = []
        for index, text in enumerate(request["input"]):
            if text.startswith("Housing policy") or "Rural Roads" in text:
                values = [1.0, 0.0]
            elif text.startswith("Affordable Housing"):
                values = [0.8, 0.6]
            else:
                values = [0.0, 1.0]
            rows.append(SimpleNamespace(index=index, embedding=values + [0.0] * (DIMENSIONS - 2)))
        return SimpleNamespace(data=rows[::-1], usage=SimpleNamespace(prompt_tokens=100))

    model = SimpleNamespace(embeddings=SimpleNamespace(create=create))
    housing = saved_embeddings["Housing"]
    params = {"issue_id": [housing, housing], "limit": 1}

    assert backfill(model, limit_bills=2) == (len(saved_embeddings), 2)
    assert backfill(model) == (0, 2)
    assert len(calls) == 3
    assert backfill(model) == (0, 0)
    assert len(calls) == 3

    first = client.get("/api/feed", params=params)
    second = client.get("/api/feed", params={**params, "page": 2})
    empty = client.get("/api/feed", params={**params, "page": 3})
    assert first.json()["total"] == second.json()["total"] == empty.json()["total"] == 2
    assert titles(first) == ["Rural Roads Act"]
    assert titles(second) == ["Affordable Housing Act"]
    assert titles(empty) == []

    with psycopg.connect(TEST_DATABASE_URL) as conn:
        conn.execute(
            """
            INSERT INTO bill_summaries (bill_id, version_code, text)
            VALUES ('119-hr-2', '01', 'Newer summary of housing assistance near roads.')
            """
        )
    stale = client.get("/api/feed", params=params)
    stale_next = client.get("/api/feed", params={**params, "page": 2})
    # The changed bill stays in the feed by keyword until its vector is refreshed
    assert stale.json()["total"] == 2
    assert titles(stale) == ["Affordable Housing Act"]
    assert titles(stale_next) == ["Rural Roads Act"]

    assert backfill(model) == (0, 1)
    assert calls[-1] == ["Rural Roads Act\n\nNewer summary of housing assistance near roads."]
    assert titles(client.get("/api/feed", params=params)) == ["Rural Roads Act"]


def test_bills_without_a_vector_follow_the_ranked_ones(saved_embeddings):
    def create(**request):
        rows = [
            SimpleNamespace(
                index=index,
                embedding=([1.0, 0.0] if "housing" in text.lower() else [0.0, 1.0])
                + [0.0] * (DIMENSIONS - 2),
            )
            for index, text in enumerate(request["input"])
        ]
        return SimpleNamespace(data=rows, usage=SimpleNamespace(prompt_tokens=10))

    model = SimpleNamespace(embeddings=SimpleNamespace(create=create))
    params = {"issue_id": saved_embeddings["Housing"]}

    # Topic vectors alone rank nothing, so every keyword match is listed
    backfill(model, limit_bills=0)
    assert titles(client.get("/api/feed", params=params)) == [
        "Affordable Housing Act",
        "Rural Roads Act",
    ]

    # A sample run embeds hr-1 and hr-2 only, and a later sync adds hr-5 with no vector
    backfill(model, limit_bills=2)
    with psycopg.connect(TEST_DATABASE_URL) as conn:
        add_bill(conn, 5, "Housing Vouchers Act", "2026-10-01")

    response = client.get("/api/feed", params=params)
    assert response.json()["total"] == 3
    assert titles(response) == ["Rural Roads Act", "Housing Vouchers Act", "Affordable Housing Act"]
