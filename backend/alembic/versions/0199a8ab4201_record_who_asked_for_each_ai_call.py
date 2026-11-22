"""record who asked for each AI call

Revision ID: 0199a8ab4201
Revises: d907097dcc60
Create Date: 2026-11-22 11:12:09.437392

"""

from collections.abc import Sequence

# Keep op available for the SQL added to upgrade and downgrade.
from alembic import op  # noqa: F401

# revision identifiers, used by Alembic.
revision: str = "0199a8ab4201"
down_revision: str | Sequence[str] | None = "d907097dcc60"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Record the reader behind a model call so daily limits can count calls per reader."""
    # Empty for calls made by a script, such as explanations and embeddings. No foreign key,
    # because a phone-verified reader can ask before finishing sign-up.
    op.execute("ALTER TABLE ai_calls ADD COLUMN uid TEXT")
    op.execute("CREATE INDEX ai_calls_feature_created_at_idx ON ai_calls (feature, created_at)")


def downgrade() -> None:
    """Remove the reader column and its index."""
    op.execute("DROP INDEX ai_calls_feature_created_at_idx")
    op.execute("ALTER TABLE ai_calls DROP COLUMN uid")
