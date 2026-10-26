"""add cache tracking and current members

Revision ID: 803cfe036e6c
Revises: d328251139e8
Create Date: 2026-10-25 17:01:38.778408

"""

from collections.abc import Sequence

# Keep op available for the SQL added to upgrade and downgrade.
from alembic import op  # noqa: F401

# revision identifiers, used by Alembic.
revision: str = "803cfe036e6c"
down_revision: str | Sequence[str] | None = "d328251139e8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add the columns that track cached details and which members are current."""
    # Existing rows all came from the current-member sync, so they start as current
    op.execute("ALTER TABLE members ADD COLUMN is_current BOOLEAN NOT NULL DEFAULT true")
    op.execute("ALTER TABLE members ADD COLUMN sponsored_synced_at TIMESTAMPTZ")
    op.execute("ALTER TABLE bills ADD COLUMN details_synced_at TIMESTAMPTZ")
    op.execute("CREATE INDEX bills_sponsor_id_idx ON bills (sponsor_id)")


def downgrade() -> None:
    """Remove the cache tracking columns and the sponsor index."""
    op.execute("DROP INDEX bills_sponsor_id_idx")
    op.execute("ALTER TABLE bills DROP COLUMN details_synced_at")
    op.execute("ALTER TABLE members DROP COLUMN sponsored_synced_at")
    op.execute("ALTER TABLE members DROP COLUMN is_current")
