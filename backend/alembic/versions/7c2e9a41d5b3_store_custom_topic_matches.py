"""Store each custom topic's nearest bills so the feed reads them without a vector scan."""

from alembic import op

revision = "7c2e9a41d5b3"
down_revision = "63773e8df1aa"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create the custom topic match table and fill it for saved topics."""
    op.execute("""
        CREATE TABLE custom_topic_matches (
            uid TEXT NOT NULL,
            topic_key TEXT NOT NULL,
            bill_id TEXT NOT NULL REFERENCES bills(bill_id) ON DELETE CASCADE,
            distance DOUBLE PRECISION NOT NULL,
            PRIMARY KEY (uid, topic_key, bill_id),
            FOREIGN KEY (uid, topic_key) REFERENCES custom_topics(uid, topic_key) ON DELETE CASCADE
        )
    """)
    op.execute("ALTER TABLE custom_topic_matches ENABLE ROW LEVEL SECURITY")
    # Topics saved before this revision get the same 200 nearest bills a new topic receives.
    op.execute("""
        INSERT INTO custom_topic_matches (uid, topic_key, bill_id, distance)
        SELECT t.uid, t.topic_key, n.bill_id, n.distance
        FROM custom_topics t
        CROSS JOIN LATERAL (
            SELECT e.bill_id, e.embedding <=> t.embedding AS distance
            FROM bill_embeddings e
            ORDER BY distance
            LIMIT 200
        ) n
        WHERE n.distance <= 0.72
    """)


def downgrade() -> None:
    """Remove the stored custom topic matches."""
    op.execute("DROP TABLE custom_topic_matches")
