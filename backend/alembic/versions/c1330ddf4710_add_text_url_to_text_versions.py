"""Add the formatted-text link to text versions.

Revision ID: c1330ddf4710
Revises: 69e9a6ddebfb
Create Date: 2026-11-06 16:24:13.823246

"""

from collections.abc import Sequence

# Keep op available for the SQL added to upgrade and downgrade.
from alembic import op  # noqa: F401

# revision identifiers, used by Alembic.
revision: str = "c1330ddf4710"
down_revision: str | Sequence[str] | None = "69e9a6ddebfb"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Store the formatted-text link of each text version, the format we read the text from."""
    op.execute("ALTER TABLE text_versions ADD COLUMN text_url TEXT")


def downgrade() -> None:
    """Remove the formatted-text link."""
    op.execute("ALTER TABLE text_versions DROP COLUMN text_url")
