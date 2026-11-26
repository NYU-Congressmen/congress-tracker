"""Save the custom topics a verified reader follows."""

import json
from time import monotonic
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response
from openai import OpenAI, OpenAIError
from pydantic import Field, StringConstraints

from app.ai.embeddings import MODEL, embed_texts
from app.ai.service import cost_usd, log_call
from app.auth import current_uid
from app.config import settings
from app.db import connect, fetch_all

router = APIRouter(tags=["account"])

FEATURE = "custom_topic_embedding"
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
    failed = False
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
        new_keys = sorted(topics.keys() - existing.keys())
        if new_keys:
            key = settings.openai_embedding_api_key
            if (
                not key
                and (settings.llm_base_url or "https://api.openai.com/v1").rstrip("/")
                == "https://api.openai.com/v1"
            ):
                key = settings.llm_api_key
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
            call = {
                "uid": uid,
                "feature": FEATURE,
                "bill_id": None,
                "model": MODEL,
                "output_tokens": 0,
            }
            try:
                with OpenAI(
                    api_key=key, base_url="https://api.openai.com/v1", timeout=7, max_retries=0
                ) as client:
                    vectors, tokens = embed_texts(client, [topics[topic] for topic in new_keys])
            except OpenAIError as error:
                failed = True
                log_call(
                    conn,
                    {
                        **call,
                        "input_tokens": 0,
                        "cost": None,
                        "seconds": monotonic() - started,
                        "succeeded": False,
                        "error": type(error).__name__,
                    },
                )
            else:
                conn.cursor().executemany(
                    "INSERT INTO custom_topics (uid, topic_key, name, embedding) "
                    "VALUES (%s, %s, %s, %s::vector)",
                    [
                        (uid, topic, topics[topic], json.dumps(vector))
                        for topic, vector in zip(new_keys, vectors, strict=True)
                    ],
                )
                log_call(
                    conn,
                    {
                        **call,
                        "input_tokens": tokens,
                        "cost": cost_usd(MODEL, tokens, 0),
                        "seconds": monotonic() - started,
                        "succeeded": True,
                        "error": None,
                    },
                )
        if not failed:
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
    if failed:
        raise HTTPException(503, "Custom topics could not be saved. Try again.")
    return [topics[topic] for topic in sorted(topics)]
