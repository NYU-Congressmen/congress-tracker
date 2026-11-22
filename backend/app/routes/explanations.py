from fastapi import APIRouter, HTTPException

from app.ai.explainer import latest_summary, source_label, stored_explanation, summary_text
from app.models import BillExplanation, BillType
from app.sync.bills import make_bill_id

router = APIRouter(tags=["explanations"])


@router.get("/bills/{congress}/{bill_type}/{number}/explanation", response_model=BillExplanation)
def get_explanation(congress: int, bill_type: BillType, number: int) -> BillExplanation:
    """Return a bill's saved explanation or its stored Congressional Research Service summary."""
    bill_id = make_bill_id(congress, bill_type, number)
    stored = stored_explanation(bill_id)
    if stored is not None:
        return BillExplanation(
            bill_id=bill_id,
            **stored.explanation.model_dump(),
            does_source="crs_summary" if stored.from_summary else "ai",
            source=stored.source,
            model=stored.model,
            cached=True,
            missing=stored.missing,
            from_stored=True,
        )

    summary = latest_summary(bill_id)
    if summary is None:
        raise HTTPException(404, "A saved explanation or official summary is unavailable.")
    return BillExplanation(
        bill_id=bill_id,
        does=summary_text(summary["text"]),
        does_source="crs_summary",
        source=source_label(True, summary["action_desc"]),
        cached=False,
        from_stored=False,
    )
