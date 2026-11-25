"""Build the saved bill and topic vectors used by the feed."""

import argparse
import json
from itertools import batched
from math import isfinite
from time import monotonic

from openai import OpenAI, OpenAIError

from app.ai.service import cost_usd, llm_client, log_call
from app.db import connect, fetch_all

MODEL = "text-embedding-3-small"
DIMENSIONS = 1536
BATCH_SIZE = 64
MAX_SUMMARY_CHARS = 4_000

PENDING_ISSUES = """
    SELECT i.* FROM issue_embedding_inputs i LEFT JOIN issue_embeddings e USING (issue_id)
    WHERE e.source_key IS DISTINCT FROM i.source_key
    ORDER BY i.issue_id
"""
PENDING_BILLS = """
    SELECT i.* FROM bill_embedding_inputs i LEFT JOIN bill_embeddings e USING (bill_id)
    WHERE i.bill_id > %s AND e.source_key IS DISTINCT FROM i.source_key
    ORDER BY i.bill_id LIMIT %s
"""

# A sync or another job can change the input while OpenAI is processing the batch.
SAVE_ISSUE = """
    INSERT INTO issue_embeddings (embedding, issue_id, source_key)
    SELECT %s::vector, issue_id, source_key FROM issue_embedding_inputs
    WHERE issue_id = %s AND source_key = %s
    ON CONFLICT (issue_id) DO UPDATE
    SET embedding = EXCLUDED.embedding, source_key = EXCLUDED.source_key
    WHERE issue_embeddings.source_key <> EXCLUDED.source_key
"""
SAVE_BILL = """
    INSERT INTO bill_embeddings (embedding, bill_id, source_key)
    SELECT %s::vector, bill_id, source_key FROM bill_embedding_inputs
    WHERE bill_id = %s AND source_key = %s
    ON CONFLICT (bill_id) DO UPDATE
    SET embedding = EXCLUDED.embedding, source_key = EXCLUDED.source_key
    WHERE bill_embeddings.source_key <> EXCLUDED.source_key
"""


def issue_input(name: str, keywords: list[str]) -> str:
    """Return the topic name and the subject terms that describe its scope."""
    terms = ", ".join(keywords)
    return f"{name} policy, including {terms}." if terms else name


def bill_input(title: str, summary: str | None) -> str:
    """Return the bill title and the capped current CRS summary if there is one."""
    if not summary:
        return title
    text = " ".join(summary.split())[:MAX_SUMMARY_CHARS]
    return f"{title}\n\n{text}"


def save_batch(
    client: OpenAI,
    sql: str,
    rows: list[tuple[int | str, str, str]],
) -> int:
    """Embed one batch and save the vectors whose input still matches the database."""
    started = monotonic()
    call = {"feature": "feed_embedding", "model": MODEL, "bill_id": None, "output_tokens": 0}
    try:
        response = client.embeddings.create(
            model=MODEL, dimensions=DIMENSIONS, input=[text for _, _, text in rows]
        )
        vectors = sorted(response.data, key=lambda item: item.index)
        if [item.index for item in vectors] != list(range(len(rows))) or any(
            len(item.embedding) != DIMENSIONS
            or not any(item.embedding)
            or not all(map(isfinite, item.embedding))
            for item in vectors
        ):
            raise OpenAIError("The embedding provider returned invalid vectors.")
    except OpenAIError as error:
        with connect() as conn:
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
        raise

    tokens = response.usage.prompt_tokens
    elapsed = monotonic() - started
    params = [
        (json.dumps(item.embedding, separators=(",", ":")), item_id, source_key)
        for item, (item_id, source_key, _) in zip(vectors, rows, strict=True)
    ]
    with connect() as conn, conn.cursor() as cursor:
        cursor.executemany(sql, params)
        saved = cursor.rowcount
        log_call(
            conn,
            {
                **call,
                "input_tokens": tokens,
                "cost": cost_usd(MODEL, tokens, 0),
                "seconds": elapsed,
                "succeeded": True,
                "error": None,
            },
        )
    return saved


def backfill(client: OpenAI, limit_bills: int | None = None) -> tuple[int, int]:
    """Refresh missing or changed topic and bill vectors and return the saved counts."""
    saved_issues = 0
    for batch in batched(fetch_all(PENDING_ISSUES), BATCH_SIZE, strict=False):
        rows = [
            (row["issue_id"], row["source_key"], issue_input(row["name"], row["keywords"]))
            for row in batch
        ]
        saved_issues += save_batch(client, SAVE_ISSUE, rows)

    saved_bills = scanned_bills = 0
    last_id = ""
    while limit_bills is None or scanned_bills < limit_bills:
        batch_size = BATCH_SIZE
        if limit_bills is not None:
            batch_size = min(batch_size, limit_bills - scanned_bills)
        batch = fetch_all(PENDING_BILLS, (last_id, batch_size))
        if not batch:
            break
        rows = [
            (row["bill_id"], row["source_key"], bill_input(row["title"], row["summary"]))
            for row in batch
        ]
        saved_bills += save_batch(client, SAVE_BILL, rows)
        last_id = batch[-1]["bill_id"]
        scanned_bills += len(batch)
    # A previous run can save every vector and stop before refreshing its distances.
    with connect() as conn:
        conn.execute("REFRESH MATERIALIZED VIEW CONCURRENTLY feed_embedding_distances")
    return saved_issues, saved_bills


def main() -> int:
    """Run the feed embedding job and print the number of vectors saved."""
    parser = argparse.ArgumentParser(description="Refresh the saved embeddings for the Pull feed.")
    parser.add_argument("--limit-bills", type=int, help="Process at most this many pending bills.")
    args = parser.parse_args()
    if args.limit_bills is not None and args.limit_bills < 0:
        parser.error("--limit-bills requires zero or a positive integer")
    try:
        with llm_client() as client:
            issues, bills = backfill(client, args.limit_bills)
    except OpenAIError as error:
        print(f"Embedding request failed ({type(error).__name__}).")
        return 1
    except RuntimeError as error:
        print(error)
        return 1
    print(f"Saved embeddings for {issues} topics and {bills} bills.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
