"""create bill summaries

Revision ID: 69e9a6ddebfb
Revises: cfca1ae1cd5b
Create Date: 2026-11-05 15:55:12.212083

"""

from collections.abc import Sequence

# Keep op available for the SQL added to upgrade and downgrade.
from alembic import op  # noqa: F401

# revision identifiers, used by Alembic.
revision: str = "69e9a6ddebfb"
down_revision: str | Sequence[str] | None = "cfca1ae1cd5b"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Create the table for CRS bill summaries, one row per bill per summary version."""
    op.execute(
        """
        CREATE TABLE bill_summaries (
            bill_id       TEXT NOT NULL REFERENCES bills (bill_id) ON DELETE CASCADE,
            version_code  TEXT NOT NULL,          -- e.g. 00 Introduced, 49 Public Law
            action_date   DATE,                   -- the stage the summary describes
            action_desc   TEXT,                   -- e.g. Introduced in Senate
            text          TEXT NOT NULL,          -- HTML written by CRS
            update_date   TIMESTAMPTZ,            -- when Congress.gov last changed it
            PRIMARY KEY (bill_id, version_code)
        )
        """
    )
    op.execute("ALTER TABLE bill_summaries ENABLE ROW LEVEL SECURITY")


def downgrade() -> None:
    """Drop the bill summaries table."""
    op.execute("DROP TABLE bill_summaries")
