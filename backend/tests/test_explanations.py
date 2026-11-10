import httpx
import psycopg
import pytest
from fastapi.testclient import TestClient

from app.ai.explainer import Explanation
from app.config import settings
from app.main import app
from tests.conftest import TEST_DATABASE_URL
from tests.test_explainer import BILL, PARTS, fake_client

client = TestClient(app)
URL = "/api/bills/119/s/3108/explanation"


@pytest.fixture
def configured(db, monkeypatch):
    """Add the bill, set both keys, and answer model calls with a fixed explanation."""
    monkeypatch.setattr(settings, "llm_model", "test-model")
    monkeypatch.setattr(settings, "congress_api_key", "test-key")
    monkeypatch.setattr("app.ai.service.llm_client", lambda: fake_client(PARTS))
    with psycopg.connect(TEST_DATABASE_URL) as conn:
        conn.execute(
            "INSERT INTO bills (bill_id, congress, type, number, title) "
            "VALUES ('119-s-3108', 119, 's', 3108, 'Example Act')"
        )
    return monkeypatch


def fetch_returns(bill):
    return lambda congress_client, congress, bill_type, number: bill


def fetch_fails(error: Exception):
    def fail(congress_client, congress, bill_type, number):
        raise error

    return fail


def test_a_bill_without_a_summary_is_explained_by_the_ai(configured) -> None:
    configured.setattr("app.routes.explanations.fetch_bill", fetch_returns(BILL))

    body = client.get(URL).json()

    assert body["does"] == PARTS.does
    assert body["does_source"] == "ai"
    assert (body["cached"], body["from_stored"], body["missing"]) == (False, False, [])


def test_missing_lookups_reach_the_page(configured) -> None:
    configured.setattr(
        "app.routes.explanations.fetch_bill",
        fetch_returns(BILL.__class__(**{**BILL.__dict__, "missing": ["committees"]})),
    )

    assert client.get(URL).json()["missing"] == ["committees"]


def test_the_saved_explanation_is_shown_when_congress_gov_fails(configured) -> None:
    configured.setattr("app.routes.explanations.fetch_bill", fetch_returns(BILL))
    client.get(URL)
    configured.setattr(
        "app.routes.explanations.fetch_bill", fetch_fails(httpx.ConnectError("down"))
    )

    body = client.get(URL).json()

    assert body["from_stored"] is True
    assert Explanation(**{k: body[k] for k in ("does", "does_not", "stands", "decides")}) == PARTS


def test_an_unexplained_bill_is_502_when_congress_gov_fails(configured) -> None:
    configured.setattr(
        "app.routes.explanations.fetch_bill", fetch_fails(httpx.ConnectError("down"))
    )

    assert client.get(URL).status_code == 502


def test_a_bill_with_no_text_yet_is_404(configured) -> None:
    configured.setattr("app.routes.explanations.fetch_bill", fetch_fails(LookupError("no text")))

    response = client.get(URL)

    assert response.status_code == 404
    assert "no published text" in response.json()["detail"]


def test_an_unknown_bill_is_404(configured) -> None:
    assert client.get("/api/bills/119/s/99999/explanation").status_code == 404
