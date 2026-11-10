from dataclasses import replace
from types import SimpleNamespace

import httpx
import psycopg
import pytest
from openai import OpenAIError

from app.ai.explainer import (
    PROMPT_VERSION,
    SUMMARY_PROMPT,
    SYSTEM_PROMPT,
    BillContext,
    Explanation,
    SummaryExplanation,
    explain,
    fetch_bill,
    latest_summary,
    related_line,
    stored_explanation,
    summary_text,
    user_message,
)
from app.config import settings
from app.sync.texts import plain_text
from tests.conftest import TEST_DATABASE_URL

BILL = BillContext(
    bill_id="119-s-3108",
    label="S 3108",
    title="AI-Related Job Impacts Clarity Act",
    sponsor="Sen. Example [R-MO]",
    latest_action="2025-11-05: Read twice and referred to committee.",
    stage="in committee, not yet passed by either chamber",
    committees=["Health, Education, Labor, and Pensions Committee (Senate)"],
    related=["HR 9352 (Identical bill), AI-Related Job Impacts Clarity Act. Latest action x"],
    text_version="Introduced in Senate",
    text="SECTION 1. SHORT TITLE.",
)
PARTS = Explanation(
    does="Requires reports.", does_not="Ban AI.", stands="In committee.", decides="HELP."
)


class FakeCompletions:
    """Record the request and answer it with a fixed parsed explanation."""

    def __init__(self, parsed: Explanation | SummaryExplanation | None):
        self.parsed = parsed
        self.request: dict = {}

    def parse(self, **request):
        self.request = request
        message = SimpleNamespace(parsed=self.parsed)
        usage = SimpleNamespace(prompt_tokens=1200, completion_tokens=300)
        return SimpleNamespace(choices=[SimpleNamespace(message=message)], usage=usage)


def fake_client(parsed: Explanation | SummaryExplanation | None) -> SimpleNamespace:
    return SimpleNamespace(chat=SimpleNamespace(completions=FakeCompletions(parsed)))


def test_plain_text_strips_tags_and_entities() -> None:
    page = "<html><body><pre>[S. 3108 Introduced]\n&lt;DOC&gt;\nSEC. 1.</pre></body></html>"

    assert plain_text(page) == "[S. 3108 Introduced]\n<DOC>\nSEC. 1."


def test_related_line_names_the_relationship_and_latest_action() -> None:
    related = {
        "type": "HR",
        "number": 9352,
        "title": "AI-Related Job Impacts Clarity Act",
        "relationshipDetails": [
            {"identifiedBy": "CRS", "type": "Identical bill"},
            {"identifiedBy": "House", "type": "SecondaryCompanionBillBecameLaw"},
        ],
        "latestAction": {"actionDate": "2026-06-18", "text": "Referred to committee."},
    }

    assert related_line(related) == (
        "HR 9352 (Identical bill), AI-Related Job Impacts Clarity Act. "
        "Latest action 2026-06-18: Referred to committee."
    )


def test_user_message_carries_status_committees_related_bills_and_text() -> None:
    message = user_message(BILL)

    assert "Latest action: 2025-11-05" in message
    assert "Related bills: HR 9352 (Identical bill)" in message
    assert "Health, Education, Labor, and Pensions Committee (Senate)" in message
    assert message.endswith("SECTION 1. SHORT TITLE.")


@pytest.fixture
def stored_bill(db, monkeypatch):
    """Add the bill and choose a model name for the service."""
    monkeypatch.setattr(settings, "llm_model", "test-model")
    with psycopg.connect(TEST_DATABASE_URL) as conn:
        conn.execute(
            "INSERT INTO bills (bill_id, congress, type, number, title) "
            "VALUES ('119-s-3108', 119, 's', 3108, 'Example Act')"
        )


def test_explain_requests_the_structured_format_and_reports_tokens(stored_bill) -> None:
    client = fake_client(PARTS)

    result = explain(BILL, client)

    assert client.chat.completions.request["response_format"] is Explanation
    assert client.chat.completions.request["model"] == "test-model"
    assert result.explanation == PARTS
    assert result.source == "Explained from the bill text (Introduced in Senate)"
    assert (result.input_tokens, result.output_tokens) == (1200, 300)
    assert result.cached is False


def test_second_explanation_comes_from_the_cache(stored_bill) -> None:
    client = fake_client(PARTS)
    explain(BILL, client)

    result = explain(BILL, fake_client(None))

    assert result.cached is True
    assert result.explanation == PARTS


def test_explain_fails_when_the_model_returns_nothing(stored_bill) -> None:
    with pytest.raises(OpenAIError, match="no structured answer"):
        explain(BILL, fake_client(None))


THREE_PARTS = SummaryExplanation(does_not="Ban AI.", stands="In committee.", decides="HELP.")


def test_summary_source_is_labeled_and_headed(stored_bill) -> None:
    bill = replace(BILL, from_summary=True, text_version="Passed Senate", text="A summary.")

    result = explain(bill, fake_client(THREE_PARTS))

    assert result.source == "Explained from the CRS summary (Passed Senate)"
    assert "CRS summary:\nA summary." in user_message(bill)


def test_with_a_summary_the_model_writes_three_parts_and_the_summary_is_what_it_does(
    stored_bill,
) -> None:
    bill = replace(BILL, from_summary=True, text_version="Passed Senate", text="A summary.")
    client = fake_client(THREE_PARTS)

    result = explain(bill, client)

    request = client.chat.completions.request
    assert request["response_format"] is SummaryExplanation
    assert request["messages"][0]["content"] == SUMMARY_PROMPT
    assert result.from_summary is True
    assert result.explanation == Explanation(does="A summary.", **THREE_PARTS.model_dump())


def test_without_a_summary_the_model_writes_all_four_parts(stored_bill) -> None:
    client = fake_client(PARTS)

    result = explain(BILL, client)

    assert client.chat.completions.request["messages"][0]["content"] == SYSTEM_PROMPT
    assert result.from_summary is False


def test_only_the_summary_prompt_drops_does_and_points_to_the_summary() -> None:
    assert "- does: " in SYSTEM_PROMPT and "- does: " not in SUMMARY_PROMPT
    assert "Readers see the CRS summary itself" in SUMMARY_PROMPT
    assert "Readers see" not in SYSTEM_PROMPT
    assert PROMPT_VERSION == "explainer-v3"


def test_summary_text_keeps_paragraph_breaks() -> None:
    html = "<p><strong>Example Act</strong></p><p>This bill requires &amp; reports.</p>"

    assert summary_text(html) == "Example Act\n\nThis bill requires & reports."


class FakeCongress:
    """Answer Congress.gov paths with fixed data, or fail the ones named in failing."""

    def __init__(self, failing: set[str]):
        self.failing = failing

    def get(self, path: str):
        endpoint = path.rsplit("/", 1)[-1]
        if endpoint in self.failing:
            raise httpx.ConnectError("Congress.gov timed out")
        if endpoint == "committees":
            return {"committees": [{"name": "HELP Committee", "chamber": "Senate"}]}
        if endpoint == "relatedbills":
            return {"relatedBills": []}
        bill = {"type": "S", "number": "3108", "title": "Example Act", "sponsors": []}
        return {"bill": {**bill, "latestAction": {"actionDate": "2025-11-05", "text": "Referred."}}}


def add_summary() -> None:
    with psycopg.connect(TEST_DATABASE_URL) as conn:
        conn.execute(
            "INSERT INTO bill_summaries (bill_id, version_code, action_date, action_desc, text)"
            " VALUES ('119-s-3108', '00', '2026-01-01', %s, '<p>A summary.</p>')",
            ("Introduced in Senate",),
        )


def test_failed_committee_and_related_lookups_are_reported_instead_of_raised(stored_bill) -> None:
    add_summary()

    bill = fetch_bill(FakeCongress({"committees", "relatedbills"}), 119, "s", 3108)

    assert bill.missing == ["committees", "related bills"]
    assert (bill.committees, bill.related) == ([], [])
    assert bill.from_summary and bill.text == "A summary."


def test_the_stored_explanation_is_the_latest_saved_one(stored_bill) -> None:
    assert stored_explanation("119-s-3108") is None
    explain(BILL, fake_client(PARTS))

    stored = stored_explanation("119-s-3108")

    assert stored.explanation == PARTS
    assert stored.from_summary is False
    assert stored.source == "Explained from the bill text"


def test_a_stored_summary_explanation_takes_what_it_does_from_the_summary(stored_bill) -> None:
    add_summary()
    bill = replace(BILL, from_summary=True, text_version="Introduced in Senate", text="A summary.")
    explain(bill, fake_client(THREE_PARTS))

    stored = stored_explanation("119-s-3108")

    assert stored.from_summary is True
    assert stored.explanation.does == "A summary."
    assert stored.source == "Explained from the CRS summary (Introduced in Senate)"


def test_latest_summary_breaks_date_ties_by_version_code(stored_bill) -> None:
    summaries = [
        ("00", "2026-01-01", "Oldest"),
        ("07", "2026-02-01", "Tied lower"),
        ("36", "2026-02-01", "Tied higher"),
    ]
    with psycopg.connect(TEST_DATABASE_URL) as conn:
        for code, day, desc in summaries:
            conn.execute(
                "INSERT INTO bill_summaries (bill_id, version_code, action_date, action_desc, text)"
                " VALUES ('119-s-3108', %s, %s, %s, '<p>x</p>')",
                (code, day, desc),
            )

    assert latest_summary("119-s-3108")["action_desc"] == "Tied higher"


def test_bill_without_a_summary_has_none(stored_bill) -> None:
    assert latest_summary("119-s-3108") is None


def test_the_stage_comes_from_the_stored_status_and_chamber_flags() -> None:
    from app.ai.explainer import stage_line

    senate_first = {"status": "passed_one_chamber", "passed_senate": True, "passed_house": False}
    assert stage_line(senate_first) == "passed by the Senate, not yet by the House"
    law = {"status": "became_law", "passed_senate": True, "passed_house": True}
    assert stage_line(law) == "became law"
    assert stage_line(None) == "unknown"


def test_the_user_message_states_the_stage() -> None:
    assert "Stage: in committee, not yet passed by either chamber" in user_message(BILL)


def test_related_bills_from_earlier_congresses_are_left_out(stored_bill) -> None:
    class Related(FakeCongress):
        def get(self, path: str):
            if path.endswith("relatedbills"):
                old = {
                    "congress": 118,
                    "type": "S",
                    "number": 1,
                    "title": "Old",
                    "latestAction": {},
                }
                live = {**old, "congress": 119, "title": "Live"}
                return {"relatedBills": [old, live]}
            return super().get(path)

    add_summary()
    bill = fetch_bill(Related(set()), 119, "s", 3108)

    assert [line.split(",")[1].strip().split(".")[0] for line in bill.related] == ["Live"]
