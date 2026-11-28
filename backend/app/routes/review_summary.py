from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException

from app.ai.review_summary import MIN_STORIES, frequent_words, highlights_for, load_stories
from app.auth import current_uid, optional_uid
from app.db import fetch_one
from app.models import BillType, ReviewSummary
from app.sample_data import sees_sample_data
from app.sync.bills import make_bill_id

router = APIRouter(tags=["reviews"])
SUMMARY_PATH = "/bills/{congress}/{bill_type}/{number}/reviews/summary"


def summarize(
    congress: int, bill_type: BillType, number: int, viewer: str | None, *, generate: bool
) -> dict[str, Any]:
    """Return the word counts and highlights of a bill's shared stories for this viewer."""
    bill_id = make_bill_id(congress, bill_type, number)
    bill = fetch_one("SELECT title FROM bills WHERE bill_id = %s", (bill_id,))
    if bill is None:
        raise HTTPException(404, "Bill not found")
    include_sample = sees_sample_data(viewer)
    stories = load_stories(bill_id, include_sample)
    highlights, written = highlights_for(
        bill_id, bill["title"], stories, include_sample, uid=viewer if generate else None
    )
    return {
        "story_count": len(stories),
        "min_stories": MIN_STORIES,
        "includes_sample": include_sample,
        "words": frequent_words(stories) if len(stories) >= MIN_STORIES else [],
        "highlights": highlights.model_dump() if highlights else None,
        "highlights_at": written,
    }


@router.get(SUMMARY_PATH, response_model=ReviewSummary)
def read_summary(
    congress: int,
    bill_type: BillType,
    number: int,
    viewer: Annotated[str | None, Depends(optional_uid)],
) -> dict[str, Any]:
    """Return the frequent words and any saved highlights of a bill's shared stories."""
    return summarize(congress, bill_type, number, viewer, generate=False)


@router.post(SUMMARY_PATH, response_model=ReviewSummary)
def write_summary(
    congress: int, bill_type: BillType, number: int, uid: Annotated[str, Depends(current_uid)]
) -> dict[str, Any]:
    """Return the summary, writing new highlights for a signed-in reader within daily limits."""
    return summarize(congress, bill_type, number, uid, generate=True)
