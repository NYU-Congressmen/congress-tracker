"""Save the custom topics a verified reader follows."""

import json
from time import monotonic
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response
from openai import OpenAI, OpenAIError
from psycopg import Connection
from pydantic import Field, StringConstraints

from app.ai.embeddings import MODEL, embed_texts
from app.ai.service import cost_usd, log_call
from app.auth import current_uid
from app.config import settings
from app.db import connect, fetch_all

router = APIRouter(tags=["account"])

FEATURE = "custom_topic_embedding"
OPENAI_BASE_URL = "https://api.openai.com/v1"
MAX_TOPICS = 8
DAILY_REQUEST_LIMIT = 12
Uid = Annotated[str, Depends(current_uid)]
TopicName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)]


@router.get("/account/custom-topics", response_model=list[str])
def list_custom_topics(uid: Uid, response: Response) -> list[str]:
    """Return the caller's saved custom topic names."""
    response.headers["Cache-Control"] = "private, no-store"
    rows = fetch_all("SELECT name FROM custom_topics WHERE uid = %s ORDER BY topic_key", (uid,))
    return [row["name"] for row in rows]


def embedding_api_key() -> str | None:
    """Return the OpenAI key for topic vectors, using the model key when it is also OpenAI's."""
    if settings.openai_embedding_api_key:
        return settings.openai_embedding_api_key
    model_base_url = (settings.llm_base_url or OPENAI_BASE_URL).rstrip("/")
    return settings.llm_api_key if model_base_url == OPENAI_BASE_URL else None


def add_topic_vectors(conn: Connection, uid: str, names: dict[str, str]) -> bool:
    """Embed and store new topics keyed by their folded names and return whether it succeeded.

    Every provider call is logged in ai_calls, which also enforces the daily limit.
    """
    key = embedding_api_key()
    if not key:
        raise HTTPException(503, "Custom topics are unavailable right now.")
    recent = conn.execute(
        "SELECT count(*) AS n FROM ai_calls WHERE uid = %s AND feature = %s "
        "AND created_at >= now() - interval '1 day'",
        (uid, FEATURE),
    ).fetchone()
    if recent["n"] >= DAILY_REQUEST_LIMIT:
        raise HTTPException(429, "You’ve reached the daily limit for adding custom topics.")

    started = monotonic()
    vectors, tokens, failure = None, 0, None
    try:
        with OpenAI(api_key=key, base_url=OPENAI_BASE_URL, timeout=7, max_retries=0) as client:
            vectors, tokens = embed_texts(client, list(names.values()))
    except OpenAIError as error:
        failure = type(error).__name__
    log_call(
        conn,
        {
            "uid": uid,
            "feature": FEATURE,
            "bill_id": None,
            "model": MODEL,
            "input_tokens": tokens,
            "output_tokens": 0,
            "cost": cost_usd(MODEL, tokens, 0) if failure is None else None,
            "seconds": monotonic() - started,
            "succeeded": failure is None,
            "error": failure,
        },
    )
    if vectors is None:
        return False
    conn.cursor().executemany(
        "INSERT INTO custom_topics (uid, topic_key, name, embedding) "
        "VALUES (%s, %s, %s, %s::vector)",
        [
            (uid, topic, name, json.dumps(vector))
            for (topic, name), vector in zip(names.items(), vectors, strict=True)
        ],
    )
    return True


@router.put("/account/custom-topics", response_model=list[str])
def save_custom_topics(
    names: Annotated[list[TopicName], Field(max_length=MAX_TOPICS)], uid: Uid, response: Response
) -> list[str]:
    """Replace the caller's topics and embed only newly added phrases."""
    response.headers["Cache-Control"] = "private, no-store"
    cleaned = [" ".join(name.split()) for name in names]
    if any("\x00" in name for name in cleaned):
        raise HTTPException(422, "Choose a topic with ordinary text.")
    topics = {name.casefold(): name for name in cleaned}
    with connect() as conn:
        # Serialize edits for this account so retries see already saved vectors.
        if (
            conn.execute("SELECT uid FROM users WHERE uid = %s FOR UPDATE", (uid,)).fetchone()
            is None
        ):
            raise HTTPException(403, "Finish signing in before saving topics.")
        existing = {
            row["topic_key"]: row["name"]
            for row in conn.execute(
                "SELECT topic_key, name FROM custom_topics WHERE uid = %s", (uid,)
            )
        }
        added = {topic: topics[topic] for topic in sorted(topics.keys() - existing.keys())}
        # A failed provider call keeps the previous topics and commits only its log entry.
        saved = not added or add_topic_vectors(conn, uid, added)
        if saved:
            conn.execute(
                "DELETE FROM custom_topics WHERE uid = %s AND NOT (topic_key = ANY(%s))",
                (uid, list(topics)),
            )
            conn.cursor().executemany(
                "UPDATE custom_topics SET name = %s WHERE uid = %s AND topic_key = %s",
                [
                    (topics[topic], uid, topic)
                    for topic in topics.keys() & existing.keys()
                    if topics[topic] != existing[topic]
                ],
            )
    if not saved:
        raise HTTPException(503, "Custom topics could not be saved. Try again.")
    return [topics[topic] for topic in sorted(topics)]
