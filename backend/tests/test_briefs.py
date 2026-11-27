from datetime import date, datetime

import pytest
from openai import OpenAIError

from app.ai.briefs import BriefInputsChanged, BriefSummary, current_week_start, generate
from app.config import settings
from app.db import connect, fetch_all
from tests.test_ai_service import FakeModel

BILL = "119-hr-1"
WEEK = date(2026, 11, 16)


@pytest.fixture
def inputs(db):
    """Create fictional consent, district, moderation and call records for one bill."""
    with connect() as conn:
        conn.execute(
            "INSERT INTO bills (bill_id, congress, type, number, title) "
            "VALUES (%s, 119, 'hr', 1, 'Example Act')",
            (BILL,),
        )
        conn.execute(
            """
            INSERT INTO members (bioguide_id, name, state, chamber, district, is_current) VALUES
                ('X000001', 'House One', 'NY', 'House', 1, true),
                ('X000002', 'House Two', 'NY', 'House', 2, true),
                ('X000003', 'Senate One', 'NY', 'Senate', NULL, true),
                ('X000004', 'House At Large', 'WY', 'House', NULL, true),
                ('X000005', 'Former Member', 'NY', 'House', 1, false)
            """
        )
        conn.execute(
            """
            INSERT INTO users (uid, phone, state, district) VALUES
                ('a', '+15550000001', 'NY', 1), ('b', '+15550000002', 'NY', 2),
                ('c', '+15550000003', 'WY', NULL), ('d', '+15550000004', 'NY', 1),
                ('e', '+15550000005', NULL, NULL), ('f', '+15550000006', 'NY', 1),
                ('g', '+15550000007', 'NY', 1), ('h', '+15550000008', 'NY', 1)
            """
        )
        conn.execute(
            """
            INSERT INTO reviews (
                uid, bill_id, stance, consent_to_share, story, hidden_at, updated_at
            )
            SELECT uid, %(bill)s, stance, consent, story, hidden_at, updated_at::timestamptz
            FROM (VALUES
                ('a', 'support', true, 'Private fictional story',
                 NULL::timestamptz, '2026-11-16 05:00Z'),
                ('b', 'oppose', true, NULL, NULL, '2026-11-22 22:00Z'),
                ('c', 'unsure', true, NULL, NULL, '2026-11-18 05:00Z'),
                ('d', 'oppose', false, NULL, NULL, '2026-11-18 05:00Z'),
                ('e', 'oppose', true, NULL, NULL, '2026-11-18 05:00Z'),
                ('f', 'oppose', true, NULL, NULL, '2026-11-16 04:59Z'),
                ('g', 'oppose', true, NULL, '2026-11-18 05:00Z', '2026-11-18 05:00Z'),
                ('h', 'oppose', true, 'Pending fictional review', NULL, '2026-11-18 05:00Z')
            ) AS data(uid, stance, consent, story, hidden_at, updated_at)
            """,
            {"bill": BILL},
        )
        conn.execute("UPDATE reviews SET moderation_status = 'cleared' WHERE uid = 'a'")
        conn.execute(
            """
            INSERT INTO actions (uid, bill_id, bioguide_id, action_type, created_at) VALUES
                ('a', %(bill)s, 'X000001', 'call', '2026-11-16 05:00Z'),
                ('a', %(bill)s, 'X000001', 'call', '2026-11-17 05:00Z'),
                ('a', %(bill)s, 'X000001', 'call', '2026-11-23 05:00Z'),
                ('a', %(bill)s, 'X000002', 'call', '2026-11-17 05:00Z'),
                ('b', %(bill)s, 'X000003', 'call', '2026-11-17 05:00Z'),
                ('d', %(bill)s, 'X000001', 'call', '2026-11-17 05:00Z')
            """,
            {"bill": BILL},
        )


def test_weekly_briefs_use_consent_and_district_and_handle_withdrawal(inputs):
    assert generate(BILL, WEEK) == 4
    drafts = fetch_all("SELECT * FROM briefs ORDER BY bioguide_id")
    assert [
        (
            r["bioguide_id"],
            r["support_count"],
            r["oppose_count"],
            r["unsure_count"],
            r["action_count"],
        )
        for r in drafts
    ] == [
        ("X000001", 1, 0, 0, 2),
        ("X000002", 0, 1, 0, 0),
        ("X000003", 1, 1, 0, 1),
        ("X000004", 0, 0, 1, 0),
    ]
    assert all(
        r["sent_at"] is None and "Private fictional story" not in r["content"] for r in drafts
    )
    assert generate(BILL, WEEK) == 4
    assert fetch_all("SELECT * FROM briefs ORDER BY bioguide_id") == drafts

    with connect() as conn:
        conn.execute("UPDATE briefs SET sent_at = now() WHERE bioguide_id = 'X000003'")
        conn.execute("UPDATE reviews SET consent_to_share = false WHERE uid IN ('a', 'b')")
    assert generate(BILL, WEEK) == 1
    remaining = fetch_all(
        "SELECT bioguide_id, support_count, sent_at FROM briefs ORDER BY bioguide_id"
    )
    assert [row["bioguide_id"] for row in remaining] == ["X000003", "X000004"]
    assert remaining[0]["support_count"] == 1 and remaining[0]["sent_at"] is not None


def test_model_receives_aggregate_counts_and_uses_the_cache(inputs, monkeypatch):
    monkeypatch.setattr(settings, "llm_model", "gpt-6-luna")
    summary = BriefSummary(summary="The reports were split among participating constituents.")
    model = FakeModel(summary)

    assert generate(BILL, WEEK, model) == 4
    assert model.calls == 4
    request = model.request["messages"][-1]["content"]
    assert "unsure_count" in request and "Example Act" in request
    assert "Private fictional story" not in request and "5550000" not in request
    assert all(
        "AI-generated summary" in row["content"] for row in fetch_all("SELECT content FROM briefs")
    )
    assert generate(BILL, WEEK, model) == 4
    assert model.calls == 4


def test_provider_failure_preserves_counts_and_changed_inputs_abort_the_write(inputs, monkeypatch):
    monkeypatch.setattr(settings, "llm_model", "gpt-6-luna")
    assert generate(BILL, WEEK, FakeModel(error=OpenAIError("Unavailable"))) == 4
    previous = fetch_all("SELECT * FROM briefs ORDER BY bioguide_id")
    assert all(
        "Calls logged" in row["content"] and "AI-generated" not in row["content"]
        for row in previous
    )

    def withdraw():
        with connect() as conn:
            conn.execute("UPDATE reviews SET consent_to_share = false WHERE uid = 'a'")

    model = FakeModel(BriefSummary(summary="Fictional summary."), before_return=withdraw)
    with pytest.raises(BriefInputsChanged):
        generate(BILL, WEEK, model)
    assert fetch_all("SELECT * FROM briefs ORDER BY bioguide_id") == previous


def test_sample_accounts_never_reach_an_office_draft(inputs):
    with connect() as conn:
        conn.execute(
            "INSERT INTO users (uid, phone, state, district, is_sample) "
            "VALUES ('sample-1', '+15550000099', 'NY', 2, true)"
        )
        conn.execute(
            "INSERT INTO reviews (uid, bill_id, stance, consent_to_share, updated_at) "
            "VALUES ('sample-1', %s, 'support', true, '2026-11-18 05:00Z')",
            (BILL,),
        )
    generate(BILL, WEEK)
    house_two = fetch_all("SELECT support_count FROM briefs WHERE bioguide_id = 'X000002'")
    assert house_two == [{"support_count": 0}]


def test_the_reporting_week_starts_on_monday_in_eastern_time():
    # Sunday night in New York is already Monday in UTC
    assert current_week_start(datetime.fromisoformat("2026-11-23T03:00:00+00:00")) == date(
        2026, 11, 16
    )
    assert current_week_start(datetime.fromisoformat("2026-11-23T05:00:00+00:00")) == date(
        2026, 11, 23
    )
