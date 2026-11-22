"""create members bills and bill actions

Revision ID: d328251139e8
Revises:
Create Date: 2026-10-25 09:39:58.466839

"""

from collections.abc import Sequence

# Keep op available for the SQL added to upgrade and downgrade.
from alembic import op  # noqa: F401

# revision identifiers, used by Alembic.
revision: str = "d328251139e8"
down_revision: str | Sequence[str] | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Create the tables for members, bills and bill history."""
    op.execute(
        """
        CREATE TABLE members (
            bioguide_id  TEXT PRIMARY KEY,   -- unique ID from Congress.gov, e.g. A000375
            name         TEXT NOT NULL,      -- "Arrington, Jodey C."
            party        TEXT,               -- D, R, I
            state        TEXT,               -- two-letter code, e.g. TX
            chamber      TEXT,               -- House or Senate
            district     INTEGER,            -- empty for senators
            image_url    TEXT
        )
        """
    )
    op.execute(
        """
        CREATE TABLE bills (
            bill_id             TEXT PRIMARY KEY,
            congress            INTEGER NOT NULL,
            type                TEXT NOT NULL,
            number              INTEGER NOT NULL,
            title               TEXT NOT NULL,
            policy_area         TEXT,
            sponsor_id          TEXT REFERENCES members (bioguide_id),
            status              TEXT NOT NULL DEFAULT 'introduced',
            introduced_date     DATE,
            latest_action_date  DATE,
            latest_action_text  TEXT,
            update_date         TIMESTAMPTZ
        )
        """
    )
    op.execute(
        """
        CREATE TABLE bill_actions (
            id           SERIAL PRIMARY KEY,
            bill_id      TEXT NOT NULL REFERENCES bills (bill_id) ON DELETE CASCADE,
            action_date  DATE,
            type         TEXT,
            text         TEXT
        )
        """
    )
    op.execute("CREATE INDEX bill_actions_bill_id_idx ON bill_actions (bill_id)")

    for table in ("members", "bills", "bill_actions"):
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")


def downgrade() -> None:
    """Drop the tables, children before parents."""
    op.execute("DROP TABLE bill_actions")
    op.execute("DROP TABLE bills")
    op.execute("DROP TABLE members")
