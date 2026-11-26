import json
from contextlib import nullcontext

import psycopg
from fastapi.testclient import TestClient
from firebase_admin import auth

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
