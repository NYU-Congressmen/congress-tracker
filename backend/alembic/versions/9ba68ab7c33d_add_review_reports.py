"""add review reports

Revision ID: 9ba68ab7c33d
Revises: 6d6057f17577
Create Date: 2026-11-22 08:38:09.601174

"""

from collections.abc import Sequence

# Keep op available for the SQL added to upgrade and downgrade.
from alembic import op  # noqa: F401

# revision identifiers, used by Alembic.
revision: str = "9ba68ab7c33d"
down_revision: str | Sequence[str] | None = "6d6057f17577"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Record reports of shared reviews, at most one per signed-in reporter."""
    op.execute(
        """
        CREATE TABLE review_reports (
            report_id     SERIAL PRIMARY KEY,
            review_id     INTEGER NOT NULL REFERENCES reviews (review_id) ON DELETE CASCADE,
            -- Empty when a visitor who is not signed in made the report
            reporter_uid  TEXT REFERENCES users (uid) ON DELETE SET NULL,
            reason        TEXT NOT NULL CHECK (
                reason IN ('spam', 'harassment', 'misinformation', 'personal_info', 'other')
            ),
            details       TEXT,
            created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )
    # Signed-in reports are what can withhold a review, so each person counts once
    op.execute(
        "CREATE UNIQUE INDEX review_reports_one_per_reporter_idx "
        "ON review_reports (review_id, reporter_uid) WHERE reporter_uid IS NOT NULL"
    )
    op.execute("CREATE INDEX review_reports_review_id_idx ON review_reports (review_id)")
    op.execute("ALTER TABLE review_reports ENABLE ROW LEVEL SECURITY")


def downgrade() -> None:
    """Drop the review reports."""
    op.execute("DROP TABLE review_reports")
