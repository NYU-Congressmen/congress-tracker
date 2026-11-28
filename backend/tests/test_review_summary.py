import psycopg
import pytest
from fastapi.testclient import TestClient

from app.ai.review_summary import ReviewHighlights
from app.auth import current_uid, optional_uid
from app.config import settings
from app.main import app
from tests.conftest import TEST_DATABASE_URL
from tests.test_ai_service import FakeModel

URL = "/api/bills/119/hr/1/reviews/summary"
HIGHLIGHTS = ReviewHighlights(
    support="Supporters want rent relief.",
    oppose="Opponents worry about cost.",
    unsure="",
    themes=["rent relief", "housing costs"],
)


def sql(statement: str, params: tuple = ()) -> None:
    with psycopg.connect(TEST_DATABASE_URL) as conn:
        conn.execute(statement, params)


def add_stories(prefix: str, count: int, sample: bool) -> None:
    for index in range(count):
        uid = f"{prefix}-{index}"
        sql(
            "INSERT INTO users (uid, phone, is_sample) VALUES (%s, %s, %s)",
            (uid, f"+1555{len(prefix)}{index:05d}", sample),
        )
        sql(
            "INSERT INTO reviews (uid, bill_id, stance, story, share_publicly) "
            "VALUES (%s, '119-hr-1', 'support', %s, true)",
            (uid, f"My rent keeps rising and rent relief matters to {prefix} family {index}."),
        )


@pytest.fixture
def client(db, monkeypatch):
    """Store a bill with five real and five sample stories and a fake model."""
    sql(
        "INSERT INTO bills (bill_id, congress, type, number, title) "
        "VALUES ('119-hr-1', 119, 'hr', 1, 'Rent Act')"
    )
    add_stories("real", 5, False)
    add_stories("sample", 5, True)
    sql("UPDATE reviews SET moderation_status = 'cleared'")
    model = FakeModel(HIGHLIGHTS)
    monkeypatch.setattr(settings, "llm_model", "gpt-6-luna")
    monkeypatch.setattr(settings, "llm_api_key", "test-key")
    monkeypatch.setattr("app.ai.service.llm_client", lambda: model)
    yield TestClient(app), model
    app.dependency_overrides.clear()


def test_visitors_read_words_but_only_a_signed_in_reader_generates(client):
    http, model = client
    visitor = http.get(URL).json()
    assert (visitor["story_count"], visitor["highlights"], model.calls) == (5, None, 0)
    words = {item["word"]: item["count"] for item in visitor["words"]}
    assert words["rent"] == 5 and "the" not in words and "matters" in words

    app.dependency_overrides[current_uid] = lambda: "real-0"
    written = http.post(URL).json()
    assert written["highlights"]["themes"] == ["rent relief", "housing costs"]
    assert model.calls == 1
    # The saved highlights now reach visitors without another model call
    assert http.get(URL).json()["highlights"]["support"] == "Supporters want rent relief."
    assert http.post(URL).json()["highlights"] is not None
    assert model.calls == 1


def test_sample_stories_stay_with_sample_accounts(client):
    http, model = client
    app.dependency_overrides[current_uid] = lambda: "sample-0"
    app.dependency_overrides[optional_uid] = lambda: "sample-0"
    sample = http.post(URL).json()
    assert (sample["story_count"], sample["includes_sample"]) == (10, True)
    assert sample["highlights"] is not None

    app.dependency_overrides.pop(optional_uid)
    # The sample summary is cached under its own feature, so a visitor never gets it
    assert http.get(URL).json()["highlights"] is None


def test_too_few_stories_give_no_summary(client):
    http, model = client
    sql("UPDATE reviews SET hidden_at = now() WHERE uid = 'real-0'")
    app.dependency_overrides[current_uid] = lambda: "real-1"
    page = http.post(URL).json()
    assert (page["story_count"], page["words"], page["highlights"], model.calls) == (4, [], None, 0)
    assert http.get("/api/bills/119/hr/9/reviews/summary").status_code == 404
