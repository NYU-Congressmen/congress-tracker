import json
from contextlib import nullcontext

import psycopg
from fastapi.testclient import TestClient
from firebase_admin import auth
from openai import OpenAIError

from app.ai.embeddings import DIMENSIONS, SAVE_BILL
from app.config import settings
from app.main import app
from app.routes import custom_topics
from tests.conftest import TEST_DATABASE_URL

client = TestClient(app)


def test_custom_topic_is_private_reused_on_retry_and_ranks_saved_bills(db, monkeypatch):
    monkeypatch.setattr(settings, "firebase_project_id", "test-pull")
    monkeypatch.setattr(settings, "openai_embedding_api_key", "test-key")

    def verify(token, **kwargs):
        return {
            "uid": token,
            "phone_number": "+16505550101" if token == "reader" else "+16505550102",
            "firebase": {"sign_in_provider": "phone"},
        }

    monkeypatch.setattr(auth, "verify_id_token", verify)
    monkeypatch.setattr(custom_topics, "OpenAI", lambda **opts: nullcontext(None))
    vector = [1.0] + [0.0] * (DIMENSIONS - 1)
    calls = []

    def embed(client, texts):
        calls.append(texts)
        return [vector for text in texts], 3

    monkeypatch.setattr(custom_topics, "embed_texts", embed)
    reader = {"Authorization": "Bearer reader"}
    other = {"Authorization": "Bearer other"}
    for headers in (reader, other):
        assert client.put("/api/account", headers=headers).status_code == 204

    with psycopg.connect(TEST_DATABASE_URL) as conn:
        conn.execute("""
            INSERT INTO bills (bill_id, congress, type, number, title)
            VALUES ('119-hr-123', 119, 'hr', 123, 'Domestic fabrication capacity')
        """)
        source = conn.execute("SELECT source_key FROM bill_embedding_inputs").fetchone()[0]
        conn.execute(SAVE_BILL, (json.dumps(vector), "119-hr-123", source))

    path = "/api/account/custom-topics"
    assert client.put(path, json=["Semiconductor  chips"], headers=reader).json() == [
        "Semiconductor chips"
    ]
    assert client.put(path, json=["semiconductor chips"], headers=reader).json() == [
        "semiconductor chips"
    ]
    assert calls == [["Semiconductor chips"]]
    assert client.get(path, headers=other).json() == []
    assert client.get("/api/feed?include_custom=true").status_code == 401
    assert client.get("/api/feed?include_custom=true", headers=other).json()["data"] == []
    assert [
        row["bill_id"]
        for row in client.get("/api/feed?include_custom=true", headers=reader).json()["data"]
    ] == ["119-hr-123"]
    assert client.put(path, json=[], headers=reader).json() == []
    assert client.get("/api/feed?include_custom=true", headers=reader).json()["data"] == []


def test_failed_custom_topic_embedding_keeps_saved_topics_and_logs_the_call(db, monkeypatch):
    monkeypatch.setattr(settings, "firebase_project_id", "test-pull")
    monkeypatch.setattr(settings, "openai_embedding_api_key", "test-key")
    monkeypatch.setattr(
        auth,
        "verify_id_token",
        lambda token, **kwargs: {
            "uid": token,
            "phone_number": "+16505550101",
            "firebase": {"sign_in_provider": "phone"},
        },
    )
    monkeypatch.setattr(custom_topics, "OpenAI", lambda **opts: nullcontext(None))
    vector = [1.0] + [0.0] * (DIMENSIONS - 1)
    monkeypatch.setattr(custom_topics, "embed_texts", lambda client, texts: ([vector], 3))
    reader = {"Authorization": "Bearer reader"}
    path = "/api/account/custom-topics"
    assert client.put("/api/account", headers=reader).status_code == 204
    assert client.put(path, json=["Rural broadband"], headers=reader).status_code == 200

    def fail(client, texts):
        raise OpenAIError("provider down")

    monkeypatch.setattr(custom_topics, "embed_texts", fail)
    response = client.put(path, json=["Water rights"], headers=reader)

    assert response.status_code == 503
    assert client.get(path, headers=reader).json() == ["Rural broadband"]
    with psycopg.connect(TEST_DATABASE_URL) as conn:
        logged = conn.execute(
            "SELECT succeeded, error FROM ai_calls WHERE uid = 'reader' ORDER BY created_at"
        ).fetchall()
    assert logged == [(True, None), (False, "OpenAIError")]
