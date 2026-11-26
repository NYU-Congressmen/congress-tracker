"""Check review text and manage the internal moderation queue."""

import argparse
import json
import logging
from typing import Any

from openai import OpenAI, OpenAIError

from app.config import settings
from app.db import fetch_all, fetch_one

MODEL = "omni-moderation-latest"
CATEGORIES = ("harassment", "harassment/threatening", "hate/threatening")
logger = logging.getLogger(__name__)

QUEUE_COLUMNS = "review_id, bill_id, moderation_revision, moderation_status, moderation_flags"
SAVE_RESULT = """
    UPDATE reviews SET moderation_status = %s, moderation_flags = %s
    WHERE review_id = %s AND moderation_revision = %s AND moderation_status = 'pending'
    RETURNING moderation_status
"""


def check_text(text: str) -> list[str] | None:
    """Return the flagged categories, or None if the provider could not check the text."""
    if not settings.moderation_api_key:
        return None
    try:
        with OpenAI(
            api_key=settings.moderation_api_key,
            base_url="https://api.openai.com/v1",
            timeout=4.0,
            max_retries=0,
        ) as client:
            result = client.moderations.create(model=MODEL, input=text)
    except OpenAIError as error:
        logger.warning("Review moderation request failed (%s)", type(error).__name__)
        return None
    if not result.results or len(result.results) != 1 or result.results[0].categories is None:
        logger.warning("Review moderation returned no classification")
        return None
    categories = result.results[0].categories.model_dump(by_alias=True)
    if any(not isinstance(categories.get(category), bool) for category in CATEGORIES):
        logger.warning("Review moderation returned incomplete categories")
        return None
    return [category for category in CATEGORIES if categories[category]]


def moderate_review(review: dict[str, Any]) -> str | None:
    """Save a decision for the current text revision and return its new status if updated."""
    if review["moderation_status"] != "pending":
        return None
    text = "\n\n".join(part for part in (review["story"], review["action_taken"]) if part)
    flags = check_text(text) if text.strip() else []
    if flags is None:
        return None
    status = "flagged" if flags else "cleared"
    # A newer edit or a human decision can arrive while the provider checks the text.
    params = (status, flags, review["review_id"], review["moderation_revision"])
    row = fetch_one(SAVE_RESULT, params)
    return row["moderation_status"] if row else None


def resolve_review(review_id: int, revision: int, status: str) -> dict[str, Any] | None:
    """Apply a human decision to the revision the operator inspected."""
    return fetch_one(
        f"""
        UPDATE reviews SET moderation_status = %s
        WHERE review_id = %s AND moderation_revision = %s
          AND moderation_status IN ('pending', 'flagged', 'held')
        RETURNING {QUEUE_COLUMNS}
        """,
        (status, review_id, revision),
    )


def main() -> int:
    """Inspect queued reviews, retry a pending check or record a human decision."""
    parser = argparse.ArgumentParser(description="Manage Pull review moderation.")
    commands = parser.add_subparsers(dest="command", required=True)
    listing = commands.add_parser("list", help="List pending and flagged reviews.")
    listing.add_argument("--after", type=int, default=0, help="List reviews after this ID.")
    for name in ("show", "check", "approve", "hold"):
        command = commands.add_parser(name)
        command.add_argument("review_id", type=int)
        if name != "show":
            command.add_argument("revision", type=int)
    args = parser.parse_args()
    if args.command == "list":
        rows = fetch_all(
            f"""
            SELECT {QUEUE_COLUMNS} FROM reviews
            WHERE moderation_status IN ('pending', 'flagged') AND review_id > %s
            ORDER BY review_id LIMIT 100
            """,
            (args.after,),
        )
        print(json.dumps(rows, indent=2))
        return 0

    if args.command in ("approve", "hold"):
        status = "cleared" if args.command == "approve" else "held"
        row = resolve_review(args.review_id, args.revision, status)
    else:
        row = fetch_one(
            f"SELECT {QUEUE_COLUMNS}, story, action_taken FROM reviews WHERE review_id = %s",
            (args.review_id,),
        )
        if args.command == "check":
            if row is None or row["moderation_revision"] != args.revision:
                row = None
            else:
                status = moderate_review(row)
                if status is None:
                    print("No decision recorded. Check the review status and provider settings.")
                    return 1
                print(status)
                return 0
    if row is None:
        print("Review not found or its moderation state changed.")
        return 1
    print(json.dumps(row, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
