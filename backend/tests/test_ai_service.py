from types import SimpleNamespace

import psycopg
import pytest
from openai import OpenAIError
from pydantic import BaseModel

from app.ai.service import ask, cache_key, cost_usd
from app.config import settings
from tests.conftest import TEST_DATABASE_URL

MESSAGES = [{"role": "user", "content": "Explain S. 3108"}]


class Answer(BaseModel):
    """Stand in for a feature's structured answer."""

    text: str


HELLO = Answer(text="hello")


class FakeModel:
    """Count calls and answer them, or fail when told to."""

    def __init__(self, parsed=HELLO, error=None, before_return=None):
        self.parsed, self.error, self.before_return = parsed, error, before_return
        self.calls = 0
        self.chat = SimpleNamespace(completions=SimpleNamespace(parse=self.parse))

    def parse(self, **request):
        self.calls += 1
        if self.error:
            raise self.error
        if self.before_return:
            self.before_return()
        usage = SimpleNamespace(prompt_tokens=1000, completion_tokens=200)
        message = SimpleNamespace(parsed=self.parsed)
        return SimpleNamespace(choices=[SimpleNamespace(message=message)], usage=usage)


@pytest.fixture
def bill(db, monkeypatch):
    """Add a bill and pick a model with a known price."""
    monkeypatch.setattr(settings, "llm_model", "gpt-6-luna")
    with psycopg.connect(TEST_DATABASE_URL) as conn:
        conn.execute(
            "INSERT INTO bills (bill_id, congress, type, number, title) "
            "VALUES ('119-s-3108', 119, 's', 3108, 'Example Act')"
        )
    return "119-s-3108"


def rows(sql: str) -> list[tuple]:
    """Return every row of a query against the test database."""
    with psycopg.connect(TEST_DATABASE_URL) as conn:
        return conn.execute(sql).fetchall()


def test_second_request_comes_from_the_cache(bill):
    model = FakeModel()

    first = ask("explanation", bill, "v1", MESSAGES, Answer, model)
    second = ask("explanation", bill, "v1", MESSAGES, Answer, model)

    assert model.calls == 1
    assert (first.cached, second.cached) == (False, True)
    assert second.value == Answer(text="hello")
    assert rows("SELECT hits FROM ai_results") == [(1,)]


def test_real_call_is_logged_with_tokens_and_cost(bill):
    answer = ask("explanation", bill, "v1", MESSAGES, Answer, FakeModel())

    assert (answer.input_tokens, answer.output_tokens) == (1000, 200)
    assert answer.cost_usd == pytest.approx(0.0002)
    logged = rows(
        "SELECT feature, input_tokens, output_tokens, cost_usd, succeeded, error FROM ai_calls"
    )
    assert len(logged) == 1
    assert logged[0][:3] == ("explanation", 1000, 200)
    assert float(logged[0][3]) == pytest.approx(0.0002)
    assert logged[0][4:] == (True, None)


def test_cache_hit_adds_no_log_row(bill):
    model = FakeModel()
    ask("explanation", bill, "v1", MESSAGES, Answer, model)
    ask("explanation", bill, "v1", MESSAGES, Answer, model)

    assert rows("SELECT count(*) FROM ai_calls") == [(1,)]


def test_new_input_text_is_a_new_version(bill):
    model = FakeModel()
    ask("explanation", bill, "v1", MESSAGES, Answer, model)
    changed = [{"role": "user", "content": "Explain S. 3108 as amended"}]

    assert ask("explanation", bill, "v1", changed, Answer, model).cached is False
    assert model.calls == 2


def test_new_prompt_version_or_model_or_feature_changes_the_key():
    base = cache_key("explanation", "v1", "gpt-6-luna", MESSAGES)

    assert base == cache_key("explanation", "v1", "gpt-6-luna", MESSAGES)
    assert base != cache_key("explanation", "v2", "gpt-6-luna", MESSAGES)
    assert base != cache_key("explanation", "v1", "gemini-flash-latest", MESSAGES)
    assert base != cache_key("diff", "v1", "gpt-6-luna", MESSAGES)


def test_failed_call_is_logged_never_cached_and_retried(bill):
    broken = FakeModel(error=OpenAIError("down"))

    with pytest.raises(OpenAIError):
        ask("explanation", bill, "v1", MESSAGES, Answer, broken)

    assert rows("SELECT count(*) FROM ai_results") == [(0,)]
    assert rows("SELECT succeeded, error, input_tokens FROM ai_calls") == [
        (False, "OpenAIError", 0)
    ]
    assert ask("explanation", bill, "v1", MESSAGES, Answer, FakeModel()).cached is False


def test_empty_answer_counts_as_a_failure(bill):
    with pytest.raises(OpenAIError, match="no structured answer"):
        ask("explanation", bill, "v1", MESSAGES, Answer, FakeModel(parsed=None))

    assert rows("SELECT count(*) FROM ai_results") == [(0,)]
    assert rows("SELECT succeeded FROM ai_calls") == [(False,)]


def test_two_requests_missing_together_keep_one_result(bill):
    def other_request_saves_first():
        ask("explanation", bill, "v1", MESSAGES, Answer, FakeModel(parsed=Answer(text="first")))

    late = FakeModel(parsed=Answer(text="second"), before_return=other_request_saves_first)

    assert ask("explanation", bill, "v1", MESSAGES, Answer, late).value.text == "second"
    assert rows("SELECT result->>'text' FROM ai_results") == [("first",)]
    assert rows("SELECT count(*) FROM ai_calls") == [(2,)]


def test_model_without_a_price_logs_tokens_and_no_cost(bill, monkeypatch):
    monkeypatch.setattr(settings, "llm_model", "gemini-flash-latest")

    answer = ask("explanation", bill, "v1", MESSAGES, Answer, FakeModel())

    assert answer.cost_usd is None
    assert rows("SELECT input_tokens, cost_usd FROM ai_calls") == [(1000, None)]
    assert cost_usd("gemini-flash-latest", 1000, 200) is None


def test_missing_model_is_reported(bill, monkeypatch):
    monkeypatch.setattr(settings, "llm_model", None)

    with pytest.raises(RuntimeError, match="LLM_MODEL is not set"):
        ask("explanation", bill, "v1", MESSAGES, Answer, FakeModel())
