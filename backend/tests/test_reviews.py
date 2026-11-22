from datetime import datetime

import psycopg
import pytest
from fastapi.testclient import TestClient

from app.ai.moderation import resolve_review
from app.auth import current_uid
from app.config import settings
from app.main import app
from app.models import MAX_REVIEW_TEXT
from tests.conftest import TEST_DATABASE_URL

URL = "/api/bills/119/hr/1/review"


@pytest.fixture
def signed_in(db, monkeypatch):
    """Sign in as a registered user with a bill to review, and sign out after the test."""
    monkeypatch.setattr(settings, "moderation_api_key", None)
    with psycopg.connect(TEST_DATABASE_URL) as conn:
        conn.execute(
            "INSERT INTO bills (bill_id, congress, type, number, title) "
            "VALUES ('119-hr-1', 119, 'hr', 1, 'Example Act')"
        )
        conn.execute("INSERT INTO users (uid, phone) VALUES ('user-1', '+15550000001')")
    # Every request in the test is made as user-1
    app.dependency_overrides[current_uid] = lambda: "user-1"
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_a_second_review_replaces_the_first(signed_in):
    first = signed_in.put(
        URL,
        json={
            "stance": "support",
            "story": "My clinic closed.",
            "consent_to_share": True,
            "share_publicly": True,
        },
    ).json()
    second = signed_in.put(URL, json={"stance": "oppose", "action_taken": "Called my senator"})
    assert second.status_code == 200
    body = second.json()
    assert body["stance"] == "oppose"
    assert body["action_taken"] == "Called my senator"
    # PUT replaces the whole review, so fields left out go back to their defaults
    assert body["story"] is None
    assert body["consent_to_share"] is False
    assert body["share_publicly"] is False
    assert body["created_at"] == first["created_at"]
    assert datetime.fromisoformat(body["updated_at"]) > datetime.fromisoformat(first["updated_at"])
    with psycopg.connect(TEST_DATABASE_URL) as conn:
        assert conn.execute("SELECT count(*) FROM reviews").fetchone()[0] == 1
    assert signed_in.get(URL).json()["stance"] == "oppose"


def test_an_unknown_stance_is_rejected(signed_in):
    assert signed_in.put(URL, json={"stance": "maybe"}).status_code == 422


def test_an_unknown_bill_and_an_unregistered_user_are_refused(signed_in):
    assert (
        signed_in.put("/api/bills/119/hr/999/review", json={"stance": "support"}).status_code == 404
    )
    app.dependency_overrides[current_uid] = lambda: "not-signed-up"
    assert signed_in.put(URL, json={"stance": "support"}).status_code == 403


def test_a_bill_without_my_review_is_404(signed_in):
    assert signed_in.get(URL).status_code == 404


def test_reviews_need_sign_in(db):
    client = TestClient(app)
    assert client.put(URL, json={"stance": "support"}).status_code == 401
    assert client.get(URL).status_code == 401


def test_blank_text_is_stored_as_no_text(signed_in):
    body = signed_in.put(URL, json={"stance": "unsure", "story": "   ", "action_taken": ""}).json()

    assert body["story"] is None
    assert body["action_taken"] is None


def test_story_is_kept_exactly_as_written(signed_in):
    story = "  My clinic closed.\n\nWe drive two hours now.  "

    assert signed_in.put(URL, json={"stance": "oppose", "story": story}).json()["story"] == story


def test_null_character_is_rejected(signed_in):
    response = signed_in.put(URL, json={"stance": "oppose", "story": "a\x00b"})

    assert response.status_code == 422


def test_text_length_limit(signed_in):
    longest = "x" * MAX_REVIEW_TEXT

    assert signed_in.put(URL, json={"stance": "oppose", "story": longest}).status_code == 200
    response = signed_in.put(URL, json={"stance": "oppose", "story": longest + "x"})
    assert response.status_code == 422


def test_flagged_review_keeps_its_text_and_can_be_rechecked(signed_in, monkeypatch):
    checked = []

    def check(text):
        checked.append(text)
        return ["harassment/threatening"] if len(checked) == 1 else []

    monkeypatch.setattr("app.ai.moderation.check_text", check)
    story = "  Fictional threat fixture.  "
    response = signed_in.put(URL, json={"stance": "oppose", "story": story})
    assert response.json()["moderation_status"] == "flagged"
    assert signed_in.get(URL).json()["story"] == story
    with psycopg.connect(TEST_DATABASE_URL) as conn:
        assert conn.execute("SELECT count(*) FROM visible_reviews").fetchone()[0] == 0
        review_id, revision = conn.execute(
            "SELECT review_id, moderation_revision FROM reviews"
        ).fetchone()

    changed = "This bill is terrible and my representative should vote against it."
    response = signed_in.put(URL, json={"stance": "oppose", "story": changed})
    assert response.json()["moderation_status"] == "cleared"
    assert checked == [story, changed]
    assert resolve_review(review_id, revision, "held") is None
    with psycopg.connect(TEST_DATABASE_URL) as conn:
        assert conn.execute("SELECT story FROM visible_reviews").fetchone()[0] == changed


def test_unavailable_moderation_preserves_the_review_and_allows_resolution(signed_in, monkeypatch):
    monkeypatch.setattr("app.ai.moderation.check_text", lambda text: None)
    response = signed_in.put(URL, json={"stance": "support", "action_taken": "Called my senator"})
    assert response.status_code == 200
    assert response.json()["moderation_status"] == "pending"
    assert signed_in.get(URL).json()["action_taken"] == "Called my senator"
    with psycopg.connect(TEST_DATABASE_URL) as conn:
        assert conn.execute("SELECT count(*) FROM visible_reviews").fetchone()[0] == 0
        review_id, revision = conn.execute(
            "SELECT review_id, moderation_revision FROM reviews"
        ).fetchone()
        conn.execute("UPDATE reviews SET hidden_at = now()")

    assert resolve_review(review_id, revision, "held")["moderation_status"] == "held"
    assert resolve_review(review_id, revision, "cleared")["moderation_status"] == "cleared"
    with psycopg.connect(TEST_DATABASE_URL) as conn:
        assert conn.execute("SELECT count(*) FROM visible_reviews").fetchone()[0] == 0
