import re
from typing import Annotated, Any

from fastapi import APIRouter, Header, HTTPException, Query, Response

from app.auth import current_phone_identity
from app.db import fetch_all, fetch_one
from app.models import BillPage, Issue

router = APIRouter(tags=["feed"])

# A minimum similarity of 0.28 filled ten results on all five topics in the bill pilot.
MAX_COSINE_DISTANCE = 0.72

# Bills ranked by meaning come first. Bills with no current vector (new since the last
# embedding run, or changed since) are matched by keyword after them, so the feed never
# drops a bill for lack of a vector. With no ranked bills, every keyword match is listed.
# Compute a distance on demand when newer embeddings have not reached the score cache.
FEED = """
    WITH selected AS MATERIALIZED (
        SELECT i.issue_id, i.source_key, i.embedding
        FROM issue_embeddings i JOIN issue_embedding_inputs src USING (issue_id)
        WHERE i.issue_id = ANY(%(ids)s) AND i.source_key = src.source_key
    ), current_vectors AS MATERIALIZED (
        SELECT e.bill_id, e.source_key
        FROM bill_embeddings e JOIN bill_embedding_inputs src USING (bill_id)
        WHERE e.source_key = src.source_key
    ), distances AS (
        SELECT c.bill_id, COALESCE(d.distance, (
            SELECT e.embedding <=> s.embedding FROM bill_embeddings e WHERE e.bill_id = c.bill_id
        )) AS distance
        FROM current_vectors c CROSS JOIN selected s
        LEFT JOIN feed_embedding_distances d
          ON d.bill_id = c.bill_id AND d.issue_id = s.issue_id
          AND d.bill_source_key = c.source_key AND d.issue_source_key = s.source_key
        WHERE (SELECT count(*) FROM selected) = %(issue_count)s
        UNION ALL
        SELECT e.bill_id, e.embedding <=> t.embedding
        FROM custom_topics t
        CROSS JOIN current_vectors c JOIN bill_embeddings e USING (bill_id)
        WHERE t.uid = %(custom_uid)s
    ), ranked AS (
        SELECT bill_id, 0 AS tier, min(distance) AS distance
        FROM distances GROUP BY bill_id
        HAVING min(distance) <= %(max_distance)s
    ), matched AS (
        SELECT b.bill_id, 1 AS tier, NULL::double precision AS distance
        FROM bills b
        WHERE (b.title ~* %(pattern)s::text OR EXISTS (
                   SELECT 1 FROM bill_summaries s
                   WHERE s.bill_id = b.bill_id AND s.text ~* %(pattern)s::text
               ))
          AND (NOT EXISTS (SELECT 1 FROM ranked)
               OR NOT EXISTS (SELECT 1 FROM current_vectors c WHERE c.bill_id = b.bill_id))
    ), combined AS (
        SELECT * FROM ranked UNION ALL SELECT * FROM matched
    ), page AS (
        SELECT b.bill_id, b.congress, b.type, b.number, b.title, b.status, b.passed_house,
               b.passed_senate, b.introduced_date, b.latest_action_date, b.latest_action_text,
               c.tier, c.distance
        FROM combined c JOIN bills b USING (bill_id)
        ORDER BY c.tier, c.distance, b.latest_action_date DESC NULLS LAST, b.bill_id
        LIMIT %(limit)s OFFSET %(offset)s
    )
    SELECT (SELECT count(*) FROM combined) AS total,
           coalesce(jsonb_agg(to_jsonb(page) - 'tier' - 'distance'
                              ORDER BY tier, distance, latest_action_date DESC NULLS LAST, bill_id),
                    '[]'::jsonb) AS data
    FROM page
"""


def keyword_pattern(keywords: list[str]) -> str:
    """Return a PostgreSQL pattern matching any keyword as whole words."""
    # Whole words keep a short keyword like AI from matching inside words like said
    return r"\y(" + "|".join(re.escape(keyword) for keyword in keywords) + r")\y"


@router.get("/issues", response_model=list[Issue])
def list_issues() -> list[dict[str, Any]]:
    """Return the issues a person can choose, in alphabetical order."""
    return fetch_all("SELECT issue_id, name FROM issues ORDER BY name")


@router.get("/feed", response_model=BillPage)
def get_feed(
    response: Response,
    issue_id: Annotated[list[int] | None, Query(min_length=1)] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    include_custom: bool = False,
    authorization: Annotated[str | None, Header()] = None,
) -> dict[str, Any]:
    """Return bills closest to any selected issue, then keyword matches lacking a vector."""
    ids = sorted(set(issue_id or []))
    if not ids and not include_custom:
        raise HTTPException(422, "Choose at least one topic.")
    custom_uid = current_phone_identity(authorization).uid if include_custom else None
    if include_custom:
        response.headers["Cache-Control"] = "private, no-store"
    issues = fetch_all(
        "SELECT issue_id, keywords FROM issues WHERE issue_id = ANY(%(ids)s)", {"ids": ids}
    )
    missing = set(ids) - {issue["issue_id"] for issue in issues}
    if missing:
        raise HTTPException(status_code=404, detail=f"Unknown issues: {sorted(missing)}")

    keywords = [keyword for issue in issues for keyword in issue["keywords"]]
    if custom_uid:
        rows = fetch_all("SELECT name FROM custom_topics WHERE uid = %s", (custom_uid,))
        keywords.extend(row["name"] for row in rows)
    result = fetch_one(
        FEED,
        {
            "ids": ids,
            "issue_count": len(ids),
            "custom_uid": custom_uid,
            "max_distance": MAX_COSINE_DISTANCE,
            # No keywords leaves the pattern NULL, which matches no bill
            "pattern": keyword_pattern(keywords) if keywords else None,
            "limit": limit,
            "offset": (page - 1) * limit,
        },
    )
    return {"page": page, "limit": limit, **result}
