"""Store private custom topics and their bill-search vectors."""

from alembic import op

revision = "d51b7a68c2f4"
down_revision = "18af59d047c2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create the account-owned custom topic table."""
    op.execute("""
        CREATE TABLE custom_topics (
            uid TEXT NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
            topic_key TEXT NOT NULL,
            name TEXT NOT NULL,
            embedding vector(1536) NOT NULL,
            PRIMARY KEY (uid, topic_key)
        )
    """)
    op.execute("ALTER TABLE custom_topics ENABLE ROW LEVEL SECURITY")


def downgrade() -> None:
    """Remove custom topics from the database."""
    op.execute("DROP TABLE custom_topics")
