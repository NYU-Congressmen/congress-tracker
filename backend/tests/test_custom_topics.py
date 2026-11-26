import json
from contextlib import nullcontext

import psycopg
import pytest
from fastapi.testclient import TestClient
from firebase_admin import auth
from openai import OpenAIError

from app.ai.embeddings import DIMENSIONS, SAVE_BILL, save_custom_matches
from app.config import settings
from app.main import app
from app.routes import custom_topics
from tests.conftest import TEST_DATABASE_URL

client = TestClient(app)
AXIS = [1.0] + [0.0] * (DIMENSIONS - 1)


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


@pytest.fixture
def reader(db, monkeypatch):
    """Sign in one phone account whose topics embed to a fixed vector, and return its headers."""
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
    monkeypatch.setattr(
        custom_topics, "embed_texts", lambda client, texts: ([AXIS] * len(texts), 3)
    )
    headers = {"Authorization": "Bearer reader"}
    assert client.put("/api/account", headers=headers).status_code == 204
    return headers


def save_bill_vector(conn, bill_id: str, title: str, vector: list[float]) -> None:
    """Insert a bill and store a vector for its current embedding input."""
    congress, bill_type, number = bill_id.split("-")
    conn.execute(
        "INSERT INTO bills (bill_id, congress, type, number, title) VALUES (%s, %s, %s, %s, %s)",
        (bill_id, int(congress), bill_type, int(number), title),
    )
    source = conn.execute(
        "SELECT source_key FROM bill_embedding_inputs WHERE bill_id = %s", (bill_id,)
    ).fetchone()[0]
    conn.execute(SAVE_BILL, (json.dumps(vector), bill_id, source))


def custom_feed(headers) -> list[str]:
    """Return the bill IDs the signed-in reader's custom topics rank."""
    response = client.get("/api/feed?include_custom=true", headers=headers)
    return [row["bill_id"] for row in response.json()["data"]]


def test_failed_custom_topic_embedding_keeps_saved_topics_and_logs_the_call(reader, monkeypatch):
    path = "/api/account/custom-topics"
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


def test_custom_topic_matches_are_stored_and_refreshed_after_new_vectors(reader):
    far = [0.0, 1.0] + [0.0] * (DIMENSIONS - 2)
    with psycopg.connect(TEST_DATABASE_URL) as conn:
        save_bill_vector(conn, "119-hr-201", "Broadband grants", AXIS)
        save_bill_vector(conn, "119-hr-202", "Unrelated fisheries bill", far)

    path = "/api/account/custom-topics"
    assert client.put(path, json=["Rural broadband"], headers=reader).status_code == 200
    assert custom_feed(reader) == ["119-hr-201"]

    # A bill embedded after the topic was saved joins the feed once the embedding job refreshes.
    with psycopg.connect(TEST_DATABASE_URL) as conn:
        save_bill_vector(conn, "119-hr-203", "Broadband mapping", AXIS)
    assert custom_feed(reader) == ["119-hr-201"]
    with psycopg.connect(TEST_DATABASE_URL) as conn:
        save_custom_matches(conn)
    assert sorted(custom_feed(reader)) == ["119-hr-201", "119-hr-203"]

    assert client.put(path, json=[], headers=reader).status_code == 200
    with psycopg.connect(TEST_DATABASE_URL) as conn:
        assert conn.execute("SELECT count(*) FROM custom_topic_matches").fetchone()[0] == 0
