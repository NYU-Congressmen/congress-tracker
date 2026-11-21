import psycopg
import pytest
from fastapi.testclient import TestClient

from app.ai.explainer import explain
from app.config import settings
from app.main import app
from tests.conftest import TEST_DATABASE_URL
from tests.test_explainer import BILL, PARTS, add_summary, fake_client

client = TestClient(app)
URL = "/api/bills/119/s/3108/explanation"


@pytest.fixture
def stored_bill(db):
    """Add a bill to the database for explanation requests."""
    with psycopg.connect(TEST_DATABASE_URL) as conn:
        conn.execute(
            "INSERT INTO bills (bill_id, congress, type, number, title) "
            "VALUES ('119-s-3108', 119, 's', 3108, 'Example Act')"
        )


def test_saved_explanation_is_available_without_service_credentials(stored_bill, monkeypatch):
    monkeypatch.setattr(settings, "llm_model", "saved-model")
    explain(BILL, fake_client(PARTS))
    monkeypatch.setattr(settings, "llm_model", "")
    monkeypatch.setattr(settings, "congress_api_key", "")
    monkeypatch.setattr(settings, "llm_api_key", "")

    response = client.get(URL)

    assert response.status_code == 200
    body = response.json()
    assert body["does"] == PARTS.does
    assert body["does_source"] == "ai"
    assert body["model"] == "saved-model"
    assert body["cached"] and body["from_stored"]


def test_official_summary_is_available_without_a_saved_explanation(stored_bill):
    add_summary()

    response = client.get(URL)

    assert response.status_code == 200
    body = response.json()
    assert body["does"] == "A summary."
    assert body["does_source"] == "crs_summary"
    assert all(body[field] is None for field in ("does_not", "stands", "decides", "model"))


def test_missing_explanation_uses_no_upstream_services(stored_bill, monkeypatch):
    monkeypatch.setattr(settings, "congress_api_key", "test-key")
    monkeypatch.setattr(settings, "llm_api_key", "test-key")
    monkeypatch.setattr(settings, "llm_model", "test-model")

    def unexpected_call(*args, **kwargs):
        pytest.fail("A public explanation request called an upstream service.")

    monkeypatch.setattr("app.sync.client.CongressClient.__init__", unexpected_call)
    monkeypatch.setattr("app.ai.service.llm_client", unexpected_call)

    response = client.get(URL)

    assert response.status_code == 404
    assert "official summary is unavailable" in response.json()["detail"]


def test_an_unknown_bill_is_404(stored_bill):
    assert client.get("/api/bills/119/s/99999/explanation").status_code == 404
