from typing import Any

from app.db import fetch_all

# A bill counts as followed once someone tracks or reviews it, so the daily sync spends its
# extra requests on bills people care about rather than on all 19,000.
FOLLOWED_BILLS_SQL = """
    SELECT b.* FROM bills b
    WHERE EXISTS (SELECT 1 FROM tracked_bills t WHERE t.bill_id = b.bill_id)
       OR EXISTS (SELECT 1 FROM reviews r WHERE r.bill_id = b.bill_id)
    ORDER BY b.bill_id
"""


def followed_bills() -> list[dict[str, Any]]:
    """Return every bill that someone tracks or has reviewed."""
    return fetch_all(FOLLOWED_BILLS_SQL)
