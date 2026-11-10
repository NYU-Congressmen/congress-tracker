"""Explain a bill in plain language from its CRS summary or text, status and committees."""

import html
import logging
import re
from dataclasses import dataclass, field

import httpx
from openai import OpenAI
from pydantic import BaseModel, Field

from app.ai.service import ask
from app.config import settings
from app.db import fetch_one
from app.sync.bills import make_bill_id
from app.sync.client import CongressClient
from app.sync.texts import plain_text

TEXT_TIMEOUT = 30.0
FEATURE = "explanation"

logger = logging.getLogger(__name__)

# Bump when SYSTEM_PROMPT changes, so explanations from the old prompt are not reused
PROMPT_VERSION = "explainer-v3"

INTRO = (
    "You explain bills in the U.S. Congress to ordinary people who are not lawyers.\n"
    "You receive the bill's official text or the Congressional Research Service's summary of it, "
    "its sponsor, its latest action, the committees it was referred to and any related bills, "
    "such as an identical bill in the other chamber.\n"
    "\n"
    "The stage line says which chambers have passed the bill. Trust it over your own reading of "
    "the latest action, write every section for that stage, and never describe a step that has "
    "already happened as if it were still to come.\n"
    "\n"
)
DOES = (
    "- does: what the bill does, in concrete terms. Say what it would do if it becomes law, or "
    "what it does now if it already has.\n"
)
OTHER_SECTIONS = (
    "- does_not: what the bill does not do, especially things a reader might wrongly assume "
    "from its title.\n"
    "- stands: where the bill is right now, including where any identical bill in the other "
    "chamber stands. If it became law, give the public law number and date when the latest "
    "action has them.\n"
    "- decides: who acts next and what they decide, naming the specific committees, chambers or "
    "the President, and only the steps that remain. If the bill became law, say instead who "
    "carries it out, such as the agency it directs, and that only a new law can change it. Do "
    "not repeat the status given in stands.\n"
)
RULES = (
    "\n"
    "Rely only on the facts you are given, but state them plainly, as settled facts. Never "
    "mention the stage line, the facts you were given or what is missing from them, so no "
    'phrase like "as provided" or "based on the information". Do not guess at motives, '
    "predict the outcome or take a side.\n"
    "Each section is two to four sentences."
)

# Used when the bill has no CRS summary, so the model writes all four sections from the text
SYSTEM_PROMPT = (
    INTRO
    + "Write four short sections in plain, neutral language:\n"
    + DOES
    + OTHER_SECTIONS
    + RULES
)

# Used when a CRS summary exists, because readers see the summary itself as what the bill does
SUMMARY_PROMPT = (
    INTRO
    + "Write three short sections in plain, neutral language:\n"
    + OTHER_SECTIONS
    + "Readers see the CRS summary itself as the account of what the bill does, so write only "
    "does_not, stands and decides, and keep them consistent with the summary.\n" + RULES
)


class Explanation(BaseModel):
    """Hold the four parts of a plain-language bill explanation."""

    does: str = Field(description="What the bill does or would do if it becomes law")
    does_not: str = Field(description="What the bill would not do")
    stands: str = Field(description="Where the bill is in the process and what comes next")
    decides: str = Field(description="Who acts next, or who carries out a bill that is law")


class SummaryExplanation(BaseModel):
    """Hold the three parts the model writes when a CRS summary says what the bill does."""

    does_not: str = Field(description="What the bill would not do")
    stands: str = Field(description="Where the bill is in the process and what comes next")
    decides: str = Field(description="Who acts next, or who carries out a bill that is law")


@dataclass
class BillContext:
    """Hold what the explainer tells the model about one bill."""

    bill_id: str
    label: str
    title: str
    sponsor: str
    latest_action: str
    stage: str
    committees: list[str]
    related: list[str]
    text_version: str
    text: str
    from_summary: bool = False
    # Facts Congress.gov failed to return, such as committees, so the reader can be told
    missing: list[str] = field(default_factory=list)


@dataclass
class ExplainResult:
    """Hold an explanation with its source label, what it cost and whether it was cached."""

    explanation: Explanation
    source: str
    from_summary: bool
    model: str
    cached: bool
    input_tokens: int
    output_tokens: int
    cost_usd: float | None
    missing: list[str] = field(default_factory=list)


# How each stored status reads to the model, so it never has to infer the stage from action text
STAGES = {
    "introduced": "introduced, not yet acted on by a committee",
    "committee": "in committee, not yet passed by either chamber",
    "passed_both_chambers": "passed by both the House and the Senate",
    "to_president": "passed by both chambers and sent to the President",
    "became_law": "became law",
}


def stage_line(row: dict | None) -> str:
    """Return the bill's stage in words from its stored status and chamber flags."""
    if row is None:
        return "unknown"
    if row["status"] == "passed_one_chamber":
        if row["passed_senate"]:
            return "passed by the Senate, not yet by the House"
        return "passed by the House, not yet by the Senate"
    return STAGES.get(row["status"], row["status"])


def summary_text(summary_html: str) -> str:
    """Return a CRS summary as plain text with a blank line between its paragraphs."""
    text = re.sub(r"</p>|<br\s*/?>", "\n\n", summary_html, flags=re.IGNORECASE)
    text = html.unescape(re.sub(r"<[^>]+>", "", text))
    return re.sub(r"\n\s*\n\s*", "\n\n", text).strip()


def related_line(related: dict) -> str:
    """Return one related bill as a line naming its relationship and latest action."""
    # Congress.gov mixes readable labels with codes such as SecondaryCompanionBillBecameLaw, which
    # the model read as saying the related bill itself became law, so only the labels are kept
    labels = {d["type"] for d in related.get("relationshipDetails", []) if " " in d["type"]}
    kinds = ", ".join(sorted(labels))
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
    stored = fetch_one(
        "SELECT status, passed_house, passed_senate FROM bills WHERE bill_id = %s", (bill_id,)
    )
    missing = []
    committees, related = [], []
    # The explanation can still be written without these, so one failing lookup does not block it
    try:
        committees = client.get(f"{path}/committees")["committees"]
    except httpx.HTTPError as error:
        logger.warning("Committees for %s could not be fetched: %s", bill_id, error)
        missing.append("committees")
    try:
        related = client.get(f"{path}/relatedbills")["relatedBills"]
        # Bills from earlier Congresses are dead, and the model mistook them for live companions
        related = [r for r in related if r.get("congress") in (None, congress)]
    except httpx.HTTPError as error:
        logger.warning("Related bills for %s could not be fetched: %s", bill_id, error)
        missing.append("related bills")
    summary = latest_summary(bill_id)
    if summary:
        version, text = summary["action_desc"] or "latest", summary_text(summary["text"])
    else:
        version, text = fetch_introduced_text(client, path)
    action = bill.get("latestAction") or {}
    return BillContext(
        bill_id=bill_id,
        label=f"{bill['type']} {bill['number']}",
        title=bill["title"],
        sponsor=", ".join(s["fullName"] for s in bill.get("sponsors", [])),
        latest_action=f"{action.get('actionDate', '')}: {action.get('text', '')}",
        stage=stage_line(stored),
        committees=[f"{c['name']} ({c['chamber']})" for c in committees],
        related=[related_line(r) for r in related],
        text_version=version,
        text=text,
        from_summary=summary is not None,
        missing=missing,
    )


def user_message(bill: BillContext) -> str:
    """Return the message that gives the model one bill's facts and text."""
    return (
        f"Bill: {bill.label}, {bill.title}\n"
        f"Sponsor: {bill.sponsor}\n"
        f"Stage: {bill.stage}\n"
        f"Latest action: {bill.latest_action}\n"
        f"Committees: {'; '.join(bill.committees) or 'none yet'}\n"
        f"Related bills: {'; '.join(bill.related) or 'none'}\n"
        f"Text version: {bill.text_version}\n\n"
        f"{'CRS summary' if bill.from_summary else 'Bill text'}:\n{bill.text}"
    )


def explain(bill: BillContext, client: OpenAI | None = None) -> ExplainResult:
    """Return a structured explanation of the bill from the cache or the model.

    With a CRS summary the model writes three parts and the summary itself is what the bill does.
    """
    prompt, schema = (
        (SUMMARY_PROMPT, SummaryExplanation) if bill.from_summary else (SYSTEM_PROMPT, Explanation)
    )
    answer = ask(
        FEATURE,
        bill.bill_id,
        PROMPT_VERSION,
        [{"role": "system", "content": prompt}, {"role": "user", "content": user_message(bill)}],
        schema,
        client,
    )
    parts = answer.value.model_dump()
    explanation = Explanation(does=bill.text, **parts) if bill.from_summary else answer.value
    return ExplainResult(
        explanation=explanation,
        source=source_label(bill.from_summary, bill.text_version),
        from_summary=bill.from_summary,
        model=answer.model,
        cached=answer.cached,
        input_tokens=answer.input_tokens,
        output_tokens=answer.output_tokens,
        cost_usd=answer.cost_usd,
        missing=bill.missing,
    )


def source_label(from_summary: bool, version: str | None) -> str:
    """Return the line that tells readers whether the CRS summary or the bill's text was used."""
    origin = "the CRS summary" if from_summary else "the bill text"
    return f"Explained from {origin} ({version})" if version else f"Explained from {origin}"


def stored_explanation(bill_id: str) -> ExplainResult | None:
    """Return the bill's most recent saved explanation, or None when it has never been explained.

    The page shows it when Congress.gov or the model cannot be reached, so a bill explained once
    stays readable during an outage.
    """
    row = fetch_one(
        """
        SELECT result FROM ai_results
        WHERE feature = %s AND bill_id = %s AND prompt_version = %s AND model = %s
        ORDER BY created_at DESC LIMIT 1
        """,
        (FEATURE, bill_id, PROMPT_VERSION, settings.llm_model),
    )
    if row is None:
        return None
    parts, version = row["result"], None
    from_summary = "does" not in parts
    if from_summary:
        summary = latest_summary(bill_id)
        if summary is None:
            return None
        parts = {**parts, "does": summary_text(summary["text"])}
        version = summary["action_desc"] or "latest"
    return ExplainResult(
        explanation=Explanation.model_validate(parts),
        source=source_label(from_summary, version),
        from_summary=from_summary,
        model=settings.llm_model,
        cached=True,
        input_tokens=0,
        output_tokens=0,
        cost_usd=None,
    )
