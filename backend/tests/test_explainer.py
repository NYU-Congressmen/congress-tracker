from dataclasses import replace
from types import SimpleNamespace

import psycopg
import pytest
from openai import OpenAIError

from app.ai.explainer import (
    BillContext,
    Explanation,
    explain,
    latest_summary,
    related_line,
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

    def __init__(self, parsed: Explanation | None):
        self.parsed = parsed
        self.request: dict = {}

    def parse(self, **request):
        self.request = request
        message = SimpleNamespace(parsed=self.parsed)
        usage = SimpleNamespace(prompt_tokens=1200, completion_tokens=300)
        return SimpleNamespace(choices=[SimpleNamespace(message=message)], usage=usage)


def fake_client(parsed: Explanation | None) -> SimpleNamespace:
    return SimpleNamespace(chat=SimpleNamespace(completions=FakeCompletions(parsed)))


def test_plain_text_strips_tags_and_entities() -> None:
    page = "<html><body><pre>[S. 3108 Introduced]\n&lt;DOC&gt;\nSEC. 1.</pre></body></html>"

    assert plain_text(page) == "[S. 3108 Introduced]\n<DOC>\nSEC. 1."


def test_related_line_names_the_relationship_and_latest_action() -> None:
    related = {
        "type": "HR",
        "number": 9352,
        "title": "AI-Related Job Impacts Clarity Act",
        "relationshipDetails": [{"identifiedBy": "CRS", "type": "Identical bill"}],
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


def test_summary_source_is_labeled_and_headed(stored_bill) -> None:
    bill = replace(BILL, from_summary=True, text_version="Passed Senate", text="A summary.")

    result = explain(bill, fake_client(PARTS))

    assert result.source == "Explained from the CRS summary (Passed Senate)"
    assert "CRS summary:\nA summary." in user_message(bill)


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
