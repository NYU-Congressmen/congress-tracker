import psycopg
import pytest
from fastapi.testclient import TestClient

from app.auth import current_uid, optional_uid
from app.main import app
from app.models import MAX_REPORT_DETAILS
from app.review_reports import main as manage_reports
from tests.conftest import TEST_DATABASE_URL

REVIEW = "/api/bills/119/hr/1/review"
SHARED = "/api/bills/119/hr/1/reviews"


def sql(statement: str, params: tuple = ()) -> list[tuple]:
    with psycopg.connect(TEST_DATABASE_URL) as conn:
        cursor = conn.execute(statement, params)
        return cursor.fetchall() if cursor.description else []


@pytest.fixture
def client(db):
    """Store a bill, a shared review, an unshared one and five people who might report."""
    sql(
        "INSERT INTO bills (bill_id, congress, type, number, title) "
        "VALUES ('119-hr-1', 119, 'hr', 1, 'Example Act')"
    )
    for index, uid in enumerate(["author", "private", "r1", "r2", "r3"]):
        sql(
            "INSERT INTO users (uid, phone, state, district) VALUES (%s, %s, 'NY', 12)",
            (uid, f"+1555000000{index}"),
        )
    sql(
        "INSERT INTO reviews (uid, bill_id, stance, story, share_publicly) "
        "VALUES ('author', '119-hr-1', 'oppose', 'My clinic closed.', true)"
    )
    sql(
        "INSERT INTO reviews (uid, bill_id, stance, story) "
        "VALUES ('private', '119-hr-1', 'support', 'Just for me.')"
    )
    yield TestClient(app)
    app.dependency_overrides.clear()


def sign_in(uid: str | None) -> None:
    """Make every later request in the test come from this user, or from a visitor."""
    app.dependency_overrides[current_uid] = lambda: uid
    app.dependency_overrides[optional_uid] = lambda: uid


def shared_review_id(client: TestClient) -> int:
    return client.get(SHARED).json()["data"][0]["review_id"]


def report(client: TestClient, review_id: int, reason: str = "spam"):
    return client.post(f"/api/reviews/{review_id}/reports", json={"reason": reason})


def test_shared_list_shows_only_shared_reviews_with_their_district(client):
    body = client.get(SHARED).json()

    assert body["total"] == 1
    (review,) = body["data"]
    assert (review["stance"], review["story"]) == ("oppose", "My clinic closed.")
    assert (review["state"], review["district"]) == ("NY", 12)
    assert "uid" not in review and "phone" not in review


def test_consent_to_the_office_brief_never_lists_a_review(client):
    # Agreeing to the Constituent Signal brief is not agreeing to be listed publicly
    sign_in("private")
    saved = client.put(REVIEW, json={"stance": "support", "consent_to_share": True}).json()
    assert (saved["consent_to_share"], saved["share_publicly"]) == (True, False)
    assert client.get(SHARED).json()["total"] == 1
    (private_id,) = sql("SELECT review_id FROM reviews WHERE uid = 'private'")[0]
    sign_in("r1")
    assert report(client, private_id).status_code == 404

    # Listing it is its own choice, and either can be made without the other
    sign_in("private")
    client.put(REVIEW, json={"stance": "support", "share_publicly": True})
    assert client.get(SHARED).json()["total"] == 2
    assert client.get(REVIEW).json()["consent_to_share"] is False


def test_author_hides_and_shows_their_review(client):
    sign_in("author")

    hidden = client.put(f"{REVIEW}/visibility", json={"hidden": True})

    assert hidden.status_code == 200
    assert hidden.json()["hidden"] is True
    assert client.get(REVIEW).json()["hidden"] is True
    assert client.get(SHARED).json()["total"] == 0
    assert client.get("/api/bills/119/hr/1/responses").json()["counts"]["oppose"] == 0

    # Editing keeps it hidden until the author shows it again
    client.put(REVIEW, json={"stance": "oppose", "story": "Edited.", "share_publicly": True})
    assert client.get(REVIEW).json()["hidden"] is True
    assert client.put(f"{REVIEW}/visibility", json={"hidden": False}).json()["hidden"] is False
    assert client.get(SHARED).json()["data"][0]["story"] == "Edited."


def test_hiding_needs_a_review_and_sign_in(client):
    assert client.put(f"{REVIEW}/visibility", json={"hidden": True}).status_code == 401
    sign_in("r1")
    assert client.put(f"{REVIEW}/visibility", json={"hidden": True}).status_code == 404


def test_a_visitor_can_report_a_shared_review(client):
    review_id = shared_review_id(client)

    response = client.post(
        f"/api/reviews/{review_id}/reports",
        json={"reason": "harassment", "details": "Names a neighbor."},
    )

    assert response.status_code == 204
    assert sql("SELECT reporter_uid, reason, details FROM review_reports") == [
        (None, "harassment", "Names a neighbor.")
    ]


def test_a_signed_in_person_counts_once(client):
    review_id = shared_review_id(client)
    sign_in("r1")

    assert report(client, review_id).status_code == 204
    assert report(client, review_id, "other").status_code == 204

    assert sql("SELECT reporter_uid, reason FROM review_reports") == [("r1", "spam")]


def test_three_signed_in_reports_withhold_a_review_until_staff_dismisses_one(client, monkeypatch):
    review_id = shared_review_id(client)
    for uid in ("r1", "r2"):
        sign_in(uid)
        report(client, review_id)
    assert client.get(SHARED).json()["total"] == 1

    sign_in("r3")
    report(client, review_id)

    assert client.get(SHARED).json()["total"] == 0
    # Withholding changes what others see, not what the author counts as their stance
    assert client.get("/api/bills/119/hr/1/responses").json()["counts"]["oppose"] == 1
    (report_id,) = sql("SELECT report_id FROM review_reports WHERE reporter_uid = 'r1'")[0]
    monkeypatch.setattr("sys.argv", ["review_reports", "dismiss", str(report_id)])
    assert manage_reports() == 0
    assert client.get(SHARED).json()["total"] == 1
    assert sql("SELECT count(*) FROM review_reports WHERE dismissed_at IS NOT NULL") == [(1,)]


def test_visitor_reports_alone_never_withhold_a_review(client):
    review_id = shared_review_id(client)
    sign_in(None)
    for _ in range(5):
        report(client, review_id)

    assert client.get(SHARED).json()["total"] == 1


def test_an_unregistered_account_reports_as_a_visitor(client):
    review_id = shared_review_id(client)
    sign_in("verified-but-not-signed-up")

    assert report(client, review_id).status_code == 204
    assert sql("SELECT reporter_uid FROM review_reports") == [(None,)]


def test_reports_of_own_unshared_or_missing_reviews_are_refused(client):
    review_id = shared_review_id(client)
    (private_id,) = sql("SELECT review_id FROM reviews WHERE uid = 'private'")[0]

    sign_in("author")
    assert report(client, review_id).status_code == 403
    sign_in(None)
    assert report(client, private_id).status_code == 404
    assert report(client, 999).status_code == 404


def test_report_reasons_and_details_are_checked(client):
    review_id = shared_review_id(client)
    url = f"/api/reviews/{review_id}/reports"

    assert client.post(url, json={"reason": "boring"}).status_code == 422
    too_long = {"reason": "other", "details": "x" * (MAX_REPORT_DETAILS + 1)}
    assert client.post(url, json=too_long).status_code == 422
    assert client.post(url, json={"reason": "other", "details": "a\x00b"}).status_code == 422
    assert client.post(url, json={"reason": "other", "details": "   "}).status_code == 204
    assert sql("SELECT details FROM review_reports") == [(None,)]


def test_shared_list_of_an_unknown_bill_is_404(client):
    assert client.get("/api/bills/119/hr/999/reviews").status_code == 404
