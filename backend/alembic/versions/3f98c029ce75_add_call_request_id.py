"""Store a request ID so a retried call entry is saved once."""

from alembic import op

revision = "3f98c029ce75"
down_revision = "9d42e3a17c6b"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add optional request IDs to existing actions and scope each ID to one account."""
    op.execute("ALTER TABLE actions ADD COLUMN request_id UUID, ADD UNIQUE (uid, request_id)")


def downgrade() -> None:
    """Remove request IDs while preserving the recorded actions."""
    op.execute("ALTER TABLE actions DROP COLUMN request_id")
