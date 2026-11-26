"""Store one profile per verified account."""

from alembic import op

revision = "63773e8df1aa"
down_revision = "d51b7a68c2f4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add profile preferences to the account record."""
    op.execute("ALTER TABLE users ADD COLUMN profile JSONB")


def downgrade() -> None:
    """Remove saved profile preferences from the account record."""
    op.execute("ALTER TABLE users DROP COLUMN profile")
