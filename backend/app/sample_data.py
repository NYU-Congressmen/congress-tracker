"""Keep sample demo accounts out of public totals except for sample viewers."""

from app.db import fetch_one

# Leaves out reviews written by sample accounts, for use where reviews are aliased as r.
EXCLUDE_SAMPLE_REVIEWS_SQL = (
    "NOT EXISTS (SELECT 1 FROM users su WHERE su.uid = r.uid AND su.is_sample)"
)


def sees_sample_data(uid: str | None) -> bool:
    """Return whether the viewer uses a sample account, which also sees sample activity."""
    if uid is None:
        return False
    row = fetch_one("SELECT is_sample FROM users WHERE uid = %s", (uid,))
    return bool(row and row["is_sample"])
