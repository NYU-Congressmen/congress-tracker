"""Record staff dismissals without removing review reports."""

from alembic import op

revision = "4b30c96e82af"
down_revision = "9eda6fd4fadd"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add the time when a staff operator dismissed a report."""
    op.execute("ALTER TABLE review_reports ADD COLUMN dismissed_at TIMESTAMPTZ")


def downgrade() -> None:
    """Remove dismissal timestamps while preserving the reports."""
    op.execute("ALTER TABLE review_reports DROP COLUMN dismissed_at")
