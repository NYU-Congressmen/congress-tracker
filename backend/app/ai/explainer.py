"""Explain a bill in plain language from its CRS summary or text, status and committees."""

from dataclasses import dataclass

import httpx
from openai import OpenAI
from pydantic import BaseModel, Field

from app.ai.service import ask
from app.db import fetch_one
from app.sync.bills import make_bill_id
from app.sync.client import CongressClient
from app.sync.texts import plain_text

TEXT_TIMEOUT = 30.0

# Bump when SYSTEM_PROMPT changes, so explanations from the old prompt are not reused
PROMPT_VERSION = "explainer-v1"

SYSTEM_PROMPT = (
    "You explain bills in the U.S. Congress to ordinary people who are not lawyers.\n"
    "You receive the bill's official text, its sponsor, its latest action, the committees "
    "it was referred to and any related bills, such as an identical bill in the other "
    "chamber.\n"
    "\n"
    "Write four short sections in plain, neutral language:\n"
    "- does: what the bill would do if it became law, in concrete terms.\n"
    "- does_not: what the bill would not do, especially things a reader might wrongly assume "
    "from its title.\n"
    "- stands: where the bill is in the legislative process right now, including where any "
    "identical bill in the other chamber stands.\n"
    "- decides: who has to act for it to become law, from the committees in each chamber to "
    "the two chambers and the President, without repeating the status already given in "
    "stands.\n"
    "\n"
    "Rely only on the facts you are given, but state them plainly, as settled facts, without "
    "mentioning what you were or were not given. Do not guess at motives, predict the outcome "
    "or take a side.\n"
    "Each section is two to four sentences."
)


class Explanation(BaseModel):
    """Hold the four parts of a plain-language bill explanation."""

    does: str = Field(description="What the bill would do if it became law")
    does_not: str = Field(description="What the bill would not do")
    stands: str = Field(description="Where the bill is in the process and what comes next")
    decides: str = Field(description="Who decides whether the bill moves forward")


@dataclass
class BillContext:
    """Hold what the explainer tells the model about one bill."""

    bill_id: str
    label: str
    title: str
    sponsor: str
    latest_action: str
    committees: list[str]
    related: list[str]
    text_version: str
    text: str
    from_summary: bool = False


@dataclass
class ExplainResult:
    """Hold an explanation with its source label, what it cost and whether it was cached."""

    explanation: Explanation
    source: str
    model: str
    cached: bool
    input_tokens: int
    output_tokens: int
    cost_usd: float | None


def related_line(related: dict) -> str:
    """Return one related bill as a line naming its relationship and latest action."""
    kinds = ", ".join(sorted({d["type"] for d in related.get("relationshipDetails", [])}))
    action = related.get("latestAction") or {}
    return (
        f"{related['type']} {related['number']} ({kinds or 'related'}), {related['title']}. "
        f"Latest action {action.get('actionDate', '')}: {action.get('text', '')}"
    )


def latest_summary(bill_id: str) -> dict | None:
    """Return a bill's current CRS summary, or None when it has no summary yet."""
    # Thirteen bills have two summaries dated the same day, so the later version code breaks ties
    return fetch_one(
        """
        SELECT action_desc, text FROM bill_summaries WHERE bill_id = %s
        ORDER BY action_date DESC NULLS LAST, version_code DESC LIMIT 1
        """,
        (bill_id,),
    )


def fetch_introduced_text(client: CongressClient, path: str) -> tuple[str, str]:
    """Return the name and plain text of a bill's earliest text version."""
    versions = client.get(f"{path}/text")["textVersions"]
    if not versions:
        raise LookupError(f"{path} has no published text yet.")
    # Congress.gov lists the newest version first, and the demo bills have only the introduced one
    version = versions[-1]
    url = next(f["url"] for f in version["formats"] if f["type"] == "Formatted Text")
    page = httpx.get(url, follow_redirects=True, timeout=TEXT_TIMEOUT)
    page.raise_for_status()
    return version["type"], plain_text(page.text)


def fetch_bill(client: CongressClient, congress: int, bill_type: str, number: int) -> BillContext:
    """Fetch a bill's details, committees, related bills and its CRS summary or earliest text."""
    path = f"/bill/{congress}/{bill_type}/{number}"
    bill_id = make_bill_id(congress, bill_type, number)
    bill = client.get(path)["bill"]
    committees = client.get(f"{path}/committees")["committees"]
    related = client.get(f"{path}/relatedbills")["relatedBills"]
    summary = latest_summary(bill_id)
    if summary:
        version, text = summary["action_desc"] or "latest", plain_text(summary["text"])
    else:
        version, text = fetch_introduced_text(client, path)
    action = bill.get("latestAction") or {}
    return BillContext(
        bill_id=bill_id,
        label=f"{bill['type']} {bill['number']}",
        title=bill["title"],
        sponsor=", ".join(s["fullName"] for s in bill.get("sponsors", [])),
        latest_action=f"{action.get('actionDate', '')}: {action.get('text', '')}",
        committees=[f"{c['name']} ({c['chamber']})" for c in committees],
        related=[related_line(r) for r in related],
        text_version=version,
        text=text,
        from_summary=summary is not None,
    )


def user_message(bill: BillContext) -> str:
    """Return the message that gives the model one bill's facts and text."""
    return (
        f"Bill: {bill.label}, {bill.title}\n"
        f"Sponsor: {bill.sponsor}\n"
        f"Latest action: {bill.latest_action}\n"
        f"Committees: {'; '.join(bill.committees) or 'none yet'}\n"
        f"Related bills: {'; '.join(bill.related) or 'none'}\n"
        f"Text version: {bill.text_version}\n\n"
        f"{'CRS summary' if bill.from_summary else 'Bill text'}:\n{bill.text}"
    )


def explain(bill: BillContext, client: OpenAI | None = None) -> ExplainResult:
    """Return a structured explanation of the bill from the cache or the model."""
    answer = ask(
        "explanation",
        bill.bill_id,
        PROMPT_VERSION,
        [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_message(bill)},
        ],
        Explanation,
        client,
    )
    origin = "the CRS summary" if bill.from_summary else "the bill text"
    return ExplainResult(
        explanation=answer.value,
        # Readers are told whether a nonpartisan summary or the bill's own text was used
        source=f"Explained from {origin} ({bill.text_version})",
        model=answer.model,
        cached=answer.cached,
        input_tokens=answer.input_tokens,
        output_tokens=answer.output_tokens,
        cost_usd=answer.cost_usd,
    )
