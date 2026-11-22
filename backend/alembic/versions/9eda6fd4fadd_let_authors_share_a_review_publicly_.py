"""let authors share a review publicly apart from brief consent

Revision ID: 9eda6fd4fadd
Revises: 0199a8ab4201
Create Date: 2026-11-22 11:40:23.562463

"""

from collections.abc import Sequence

# Keep op available for the SQL added to upgrade and downgrade.
from alembic import op  # noqa: F401

# revision identifiers, used by Alembic.
revision: str = "9eda6fd4fadd"
down_revision: str | Sequence[str] | None = "0199a8ab4201"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add the author's choice to list a review on the bill page.

    `consent_to_share` stays the author's consent to include the review in the Constituent
    Signal brief for their representative's office. Listing it publicly, with the author's
    state and district, is a separate choice, so agreeing to one never implies the other.
    """
    op.execute(
        """
        ALTER TABLE reviews
        ADD COLUMN share_publicly BOOLEAN NOT NULL DEFAULT false
        """
    )
    op.execute(
        "COMMENT ON COLUMN reviews.consent_to_share IS "
        "'Include the review in the Constituent Signal brief for the author''s office'"
    )
    op.execute(
        "COMMENT ON COLUMN reviews.share_publicly IS "
        "'List the review on the bill page with the author''s state and district'"
    )


def downgrade() -> None:
    """Remove the public sharing choice."""
    op.execute("COMMENT ON COLUMN reviews.consent_to_share IS NULL")
    op.execute("ALTER TABLE reviews DROP COLUMN share_publicly")
