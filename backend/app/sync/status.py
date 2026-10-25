from collections.abc import Iterable
from typing import Any

# Stages in the order a bill moves through them, so a later stage always ranks higher
STAGES = ("introduced", "committee", "passed_house", "passed_senate", "to_president", "became_law")

# SQL that keeps a bill's stored status unless the incoming one ranks higher
NEVER_DOWNGRADE_SQL = f"""
    CASE WHEN array_position(ARRAY{list(STAGES)}::text[], EXCLUDED.status)
              > array_position(ARRAY{list(STAGES)}::text[], bills.status)
         THEN EXCLUDED.status ELSE bills.status END
"""


def status_from_action(
    action_type: str | None, text: str | None, bill_type: str | None = None
) -> str:
    """Return the bill status one action shows, checking the furthest stage first.

    Passing the bill type lets actions that depend on the chamber, such as being held at
    the desk, count as passing the other chamber.
    """
    text = (text or "").lower()
    action_type = action_type or ""
    house_bill = (bill_type or "").lower().startswith("h")
    if action_type == "BecameLaw" or "became public law" in text:
        return "became_law"
    elif "presented to president" in text or "signed by president" in text:
        return "to_president"
    elif "passed/agreed to in senate" in text or "received in the house" in text:
        return "passed_senate"
    elif "passed/agreed to in house" in text or "received in the senate" in text:
        return "passed_house"
    # A bill waits at the desk or on the Senate calendar after the other chamber passes it
    elif bill_type and ("held at the desk" in text or "senate legislative calendar" in text):
        if house_bill:
            return "passed_house"
        return "committee" if "calendar" in text else "passed_senate"
    elif (
        action_type == "Committee"
        or "referred to" in text
        or "committee" in text
        or "reported" in text
        or "union calendar" in text
        or "house calendar" in text
    ):
        return "committee"
    return "introduced"


def furthest_status(actions: Iterable[dict[str, Any]], bill_type: str | None = None) -> str:
    """Return the furthest status any of a bill's actions reaches."""
    statuses = [status_from_action(a.get("type"), a.get("text"), bill_type) for a in actions]
    return max(statuses, key=STAGES.index, default="introduced")
