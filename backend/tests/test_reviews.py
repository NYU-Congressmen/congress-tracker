from datetime import datetime

import psycopg
import pytest
from fastapi.testclient import TestClient

from app.auth import current_uid
from app.main import app
from tests.conftest import TEST_DATABASE_URL

URL = "/api/bills/119/hr/1/review"


@pytest.fixture
def signed_in(db):
    """Sign in as a registered user with a bill to review, and sign out after the test."""
    with psycopg.connect(TEST_DATABASE_URL) as conn:
        conn.execute(
            "INSERT INTO bills (bill_id, congress, type, number, title) "
            "VALUES ('119-hr-1', 119, 'hr', 1, 'Example Act')"
        )
        conn.execute("INSERT INTO users (uid, phone) VALUES ('user-1', '+15550000001')")
    # The stubbed sign-in: every request in the test is made as user-1
    app.dependency_overrides[current_uid] = lambda: "user-1"
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_a_second_review_replaces_the_first(signed_in):
    first = signed_in.put(
        URL, json={"stance": "support", "story": "My clinic closed.", "consent_to_share": True}
    ).json()
    second = signed_in.put(URL, json={"stance": "oppose", "action_taken": "Called my senator"})
    assert second.status_code == 200
    body = second.json()
    assert body["stance"] == "oppose"
    assert body["action_taken"] == "Called my senator"
    # PUT replaces the whole review, so fields left out go back to their defaults
    assert body["story"] is None
    assert body["consent_to_share"] is False
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
