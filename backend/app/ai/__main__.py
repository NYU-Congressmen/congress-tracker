import sys

from app.ai.explainer import explain, fetch_bill
from app.config import settings
from app.sync.client import CongressClient

USAGE = "Usage: uv run --directory backend python -m app.ai CONGRESS TYPE NUMBER, as in 119 s 3108"


def main(argv: list[str]) -> int:
    """Explain one bill from the command line and print the four parts and the tokens used."""
    if len(argv) != 3 or not argv[0].isdigit() or not argv[2].isdigit():
        print(USAGE)
        return 2
    if not settings.congress_api_key or not settings.llm_model:
        print("CONGRESS_API_KEY and LLM_MODEL must be set in the .env file at the repo root.")
        return 1
    congress, bill_type, number = int(argv[0]), argv[1].lower(), int(argv[2])
    with CongressClient(settings.congress_api_key) as congress_client:
        bill = fetch_bill(congress_client, congress, bill_type, number)
    result = explain(bill)
    parts = result.explanation
    print(f"{bill.label}: {bill.title}\n{result.source}\n")
    does = "Summary (official CRS summary)" if result.from_summary else "Summary"
    if bill.missing:
        print(f"Congress.gov did not return: {', '.join(bill.missing)}\n")
    for heading, body in (
        (does, parts.does),
        ("Limits", parts.does_not),
        ("Status", parts.stands),
        ("Next steps", parts.decides),
    ):
        print(f"{heading}\n{body}\n")
    if result.cached:
        print(f"{result.model}: from the cache, with no model call")
    else:
        cost = "unknown cost" if result.cost_usd is None else f"${result.cost_usd:.6f}"
        print(
            f"{result.model}: {result.input_tokens} input and {result.output_tokens} output "
            f"tokens, {cost}"
        )
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
