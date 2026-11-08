"""Make every model call in one place, with caching and a log of tokens, cost and failures."""

import hashlib
import json
from dataclasses import dataclass
from time import monotonic

from openai import OpenAI, OpenAIError
from psycopg.types.json import Jsonb
from pydantic import BaseModel

from app.config import settings
from app.db import connect

LLM_TIMEOUT = 60.0

# Dollars per million input and output tokens. Models not listed log their tokens with no cost.
PRICES = {"gpt-6-luna": (0.10, 0.50)}

SAVE_RESULT_SQL = """
    INSERT INTO ai_results (cache_key, feature, bill_id, model, prompt_version, result)
    VALUES (%(key)s, %(feature)s, %(bill_id)s, %(model)s, %(prompt_version)s, %(result)s)
    ON CONFLICT (cache_key) DO NOTHING
"""

LOG_CALL_SQL = """
    INSERT INTO ai_calls (feature, bill_id, model, input_tokens, output_tokens, cost_usd, seconds,
                          succeeded, error)
    VALUES (%(feature)s, %(bill_id)s, %(model)s, %(input_tokens)s, %(output_tokens)s, %(cost)s,
            %(seconds)s, %(succeeded)s, %(error)s)
"""


@dataclass
class AiAnswer[Result: BaseModel]:
    """Hold a structured answer, whether it came from the cache, and what it cost."""

    value: Result
    cached: bool
    model: str
    input_tokens: int = 0
    output_tokens: int = 0
    cost_usd: float | None = None


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


def cost_usd(model: str, input_tokens: int, output_tokens: int) -> float | None:
    """Return a call's cost in dollars, or None when the model has no known price."""
    if model not in PRICES:
        return None
    input_price, output_price = PRICES[model]
    return (input_tokens * input_price + output_tokens * output_price) / 1_000_000


def cache_key(feature: str, prompt_version: str, model: str, messages: list[dict]) -> str:
    """Return a hash that changes when the feature, prompt, model or any input text changes."""
    payload = json.dumps([feature, prompt_version, model, messages], sort_keys=True)
    return hashlib.sha256(payload.encode()).hexdigest()


def log_call(conn, call: dict) -> None:
    """Add one real model call to the log."""
    conn.execute(LOG_CALL_SQL, call)


def ask[Result: BaseModel](
    feature: str,
    bill_id: str,
    prompt_version: str,
    messages: list[dict],
    schema: type[Result],
    client: OpenAI | None = None,
) -> AiAnswer[Result]:
    """Return a structured answer from the cache, or from the model when it is not cached.

    A failed call is logged and raised, and never cached, so the next request tries again.
    """
    model = settings.llm_model
    if not model:
        raise RuntimeError("LLM_MODEL is not set. Add it to the .env file at the repo root.")
    key = cache_key(feature, prompt_version, model, messages)
    with connect() as conn:
        row = conn.execute(
            "UPDATE ai_results SET hits = hits + 1 WHERE cache_key = %s RETURNING result", (key,)
        ).fetchone()
    if row is not None:
        return AiAnswer(schema.model_validate(row["result"]), cached=True, model=model)

    call = {"feature": feature, "bill_id": bill_id, "model": model}
    started = monotonic()
    try:
        completion = (client or llm_client()).chat.completions.parse(
            model=model, messages=messages, response_format=schema
        )
        value = completion.choices[0].message.parsed
        if value is None:
            raise OpenAIError("The model returned no structured answer.")
    except OpenAIError as error:
        with connect() as conn:
            log_call(
                conn,
                {
                    **call,
                    "input_tokens": 0,
                    "output_tokens": 0,
                    "cost": None,
                    "seconds": monotonic() - started,
                    "succeeded": False,
                    "error": type(error).__name__,
                },
            )
        raise

    usage = completion.usage
    input_tokens = usage.prompt_tokens if usage else 0
    output_tokens = usage.completion_tokens if usage else 0
    cost = cost_usd(model, input_tokens, output_tokens)
    with connect() as conn:
        # Two requests can miss together, and the first to save keeps its answer
        conn.execute(
            SAVE_RESULT_SQL,
            {
                "key": key,
                "feature": feature,
                "bill_id": bill_id,
                "model": model,
                "prompt_version": prompt_version,
                "result": Jsonb(value.model_dump()),
            },
        )
        log_call(
            conn,
            {
                **call,
                "input_tokens": input_tokens,
                "output_tokens": output_tokens,
                "cost": cost,
                "seconds": monotonic() - started,
                "succeeded": True,
                "error": None,
            },
        )
    return AiAnswer(value, False, model, input_tokens, output_tokens, cost)
