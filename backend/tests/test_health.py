import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.main import app

client = TestClient(app)


def test_health_reports_ok():
    response = client.get("/api/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert set(body) == {
        "status",
        "database_configured",
        "congress_api_configured",
        "custom_topics_configured",
        "summaries_configured",
    }


@pytest.mark.parametrize(
    ("embedding_key", "llm_key", "llm_base_url", "llm_model", "custom_topics", "summaries"),
    [
        (None, None, None, None, False, False),
        ("embed-key", None, None, None, True, False),
        (None, "model-key", "https://api.openai.com/v1/", "gpt-6-luna", True, True),
        (
            None,
            "model-key",
            "https://generativelanguage.googleapis.com/v1beta/openai/",
            "gemini",
            False,
            True,
        ),
    ],
)
def test_health_reports_which_openai_features_have_keys(
    monkeypatch, embedding_key, llm_key, llm_base_url, llm_model, custom_topics, summaries
):
    monkeypatch.setattr(settings, "openai_embedding_api_key", embedding_key)
    monkeypatch.setattr(settings, "llm_api_key", llm_key)
    monkeypatch.setattr(settings, "llm_base_url", llm_base_url)
    monkeypatch.setattr(settings, "llm_model", llm_model)
    body = client.get("/api/health").json()
    assert body["custom_topics_configured"] is custom_topics
    assert body["summaries_configured"] is summaries
