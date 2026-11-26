"""Mark demo accounts whose activity stays out of public totals."""

from alembic import op

revision = "b5d81f0c3a62"
down_revision = "7c2e9a41d5b3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add the sample flag to accounts, false for every existing account."""
    op.execute("ALTER TABLE users ADD COLUMN is_sample BOOLEAN NOT NULL DEFAULT false")


def downgrade() -> None:
    """Remove the sample flag."""
    op.execute("ALTER TABLE users DROP COLUMN is_sample")
