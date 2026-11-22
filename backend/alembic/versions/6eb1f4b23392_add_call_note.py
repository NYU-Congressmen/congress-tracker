"""Store the optional private note on a logged call."""

from alembic import op

revision = "6eb1f4b23392"
down_revision = "3f98c029ce75"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add an optional note to call entries."""
    op.execute("ALTER TABLE actions ADD COLUMN call_note TEXT")


def downgrade() -> None:
    """Remove call notes while preserving the recorded actions."""
    op.execute("ALTER TABLE actions DROP COLUMN call_note")
