from typing import Any

import httpx
from fastapi import APIRouter, HTTPException
from openai import OpenAIError

from app.ai.explainer import ExplainResult, explain, fetch_bill, stored_explanation
from app.config import settings
from app.db import fetch_one
from app.models import BillExplanation, BillType
from app.sync.bills import make_bill_id
from app.sync.client import CongressClient

router = APIRouter(tags=["explanations"])


def explanation_body(bill_id: str, result: ExplainResult, from_stored: bool) -> dict[str, Any]:
    """Return an explanation in the shape of the BillExplanation response."""
    return {
        "bill_id": bill_id,
        **result.explanation.model_dump(),
        "does_source": "crs_summary" if result.from_summary else "ai",
        "source": result.source,
        "model": result.model,
        "cached": result.cached,
        "missing": result.missing,
        "from_stored": from_stored,
    }


@router.get("/bills/{congress}/{bill_type}/{number}/explanation", response_model=BillExplanation)
def get_explanation(congress: int, bill_type: BillType, number: int) -> dict[str, Any]:
    """Return a plain-language explanation of a bill, generating it on the first request.

    When Congress.gov or the model fails, the bill's last saved explanation is returned instead.
    """
    bill_id = make_bill_id(congress, bill_type, number)
    if fetch_one("SELECT 1 FROM bills WHERE bill_id = %s", (bill_id,)) is None:
        raise HTTPException(404, "Bill not found")
    if not settings.congress_api_key or not settings.llm_model:
        raise HTTPException(503, "Explanations need CONGRESS_API_KEY and LLM_MODEL in .env.")
    try:
        with CongressClient(settings.congress_api_key) as client:
            bill = fetch_bill(client, congress, bill_type, number)
        result = explain(bill)
    except (httpx.HTTPError, OpenAIError, LookupError) as error:
        stored = stored_explanation(bill_id)
        if stored is not None:
            return explanation_body(bill_id, stored, from_stored=True)
        if isinstance(error, LookupError):
            raise HTTPException(404, "This bill has no published text or summary yet.") from error
        raise HTTPException(502, "The explanation could not be generated right now.") from error
    return explanation_body(bill_id, result, from_stored=False)
