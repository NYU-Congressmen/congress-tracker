"""Explain a bill in plain language from its text, status and committees."""

import html
import re
from dataclasses import dataclass

import httpx
from openai import OpenAI
from pydantic import BaseModel, Field

from app.config import settings
from app.sync.client import CongressClient

TEXT_TIMEOUT = 30.0
LLM_TIMEOUT = 60.0

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

    label: str
    title: str
    sponsor: str
    latest_action: str
    committees: list[str]
    related: list[str]
    text_version: str
    text: str


@dataclass
class ExplainResult:
    """Hold an explanation with its source label and the tokens it cost."""

    explanation: Explanation
    source: str
    model: str
    input_tokens: int
    output_tokens: int


def plain_text(page: str) -> str:
    """Return the readable text of a Congress.gov formatted-text page."""
    text = re.sub(r"<[^>]+>", "", page)
    return html.unescape(text).strip()


def related_line(related: dict) -> str:
    """Return one related bill as a line naming its relationship and latest action."""
    kinds = ", ".join(sorted({d["type"] for d in related.get("relationshipDetails", [])}))
    action = related.get("latestAction") or {}
    return (
        f"{related['type']} {related['number']} ({kinds or 'related'}), {related['title']}. "
        f"Latest action {action.get('actionDate', '')}: {action.get('text', '')}"
    )


def fetch_bill(client: CongressClient, congress: int, bill_type: str, number: int) -> BillContext:
    """Fetch a bill's details, committees, related bills and earliest text and return them."""
    path = f"/bill/{congress}/{bill_type}/{number}"
    bill = client.get(path)["bill"]
    committees = client.get(f"{path}/committees")["committees"]
    related = client.get(f"{path}/relatedbills")["relatedBills"]
    versions = client.get(f"{path}/text")["textVersions"]
    if not versions:
        raise LookupError(f"{bill_type.upper()} {number} has no published text yet.")
    # Congress.gov lists the newest version first, and the demo bills have only the introduced one
    version = versions[-1]
    url = next(f["url"] for f in version["formats"] if f["type"] == "Formatted Text")
    page = httpx.get(url, follow_redirects=True, timeout=TEXT_TIMEOUT)
    page.raise_for_status()
    action = bill.get("latestAction") or {}
    return BillContext(
        label=f"{bill['type']} {bill['number']}",
        title=bill["title"],
        sponsor=", ".join(s["fullName"] for s in bill.get("sponsors", [])),
        latest_action=f"{action.get('actionDate', '')}: {action.get('text', '')}",
        committees=[f"{c['name']} ({c['chamber']})" for c in committees],
        related=[related_line(r) for r in related],
        text_version=version["type"],
        text=plain_text(page.text),
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
        f"Bill text:\n{bill.text}"
    )


def llm_client() -> OpenAI:
    """Return a client for the model endpoint configured in .env."""
    if not settings.llm_api_key:
        raise RuntimeError("LLM_API_KEY is not set. Add it to the .env file at the repo root.")
    # The SDK's default of ten minutes per request hides a stalled provider for far too long
    return OpenAI(
        api_key=settings.llm_api_key,
        base_url=settings.llm_base_url,
        timeout=LLM_TIMEOUT,
        max_retries=2,
    )


def explain(bill: BillContext, client: OpenAI, model: str) -> ExplainResult:
    """Ask the model for a structured explanation of the bill and return it with its tokens."""
    completion = client.chat.completions.parse(
        model=model,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_message(bill)},
        ],
        response_format=Explanation,
    )
    explanation = completion.choices[0].message.parsed
    if explanation is None:
        raise RuntimeError("The model returned no explanation.")
    usage = completion.usage
    return ExplainResult(
        explanation=explanation,
        # Neither demo bill has a CRS summary, so readers are told the explanation's source
        source=f"Explained from the bill text ({bill.text_version})",
        model=model,
        input_tokens=usage.prompt_tokens if usage else 0,
        output_tokens=usage.completion_tokens if usage else 0,
    )
