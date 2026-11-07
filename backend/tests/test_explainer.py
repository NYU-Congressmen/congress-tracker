from types import SimpleNamespace

import pytest

from app.ai.explainer import (
    BillContext,
    Explanation,
    explain,
    related_line,
    user_message,
)
from app.sync.texts import plain_text

BILL = BillContext(
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


def test_explain_requests_the_structured_format_and_reports_tokens() -> None:
    client = fake_client(PARTS)

    result = explain(BILL, client, "test-model")

    assert client.chat.completions.request["response_format"] is Explanation
    assert client.chat.completions.request["model"] == "test-model"
    assert result.explanation == PARTS
    assert result.source == "Explained from the bill text (Introduced in Senate)"
    assert (result.input_tokens, result.output_tokens) == (1200, 300)


def test_explain_fails_when_the_model_returns_nothing() -> None:
    with pytest.raises(RuntimeError, match="no explanation"):
        explain(BILL, fake_client(None), "test-model")
