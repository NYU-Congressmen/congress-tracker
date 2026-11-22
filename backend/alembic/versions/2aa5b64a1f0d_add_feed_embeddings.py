"""Store embeddings for bills and the topics followed in the feed."""

from alembic import op

revision = "2aa5b64a1f0d"
down_revision = "46b919d6d069"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add vector storage and expose the current inputs used to detect stale embeddings."""
    op.execute(
        """
        CREATE TABLE bill_embeddings (
            bill_id TEXT PRIMARY KEY REFERENCES bills (bill_id) ON DELETE CASCADE,
            embedding vector(1536) NOT NULL,
            source_key TEXT NOT NULL
        )
        """
    )
    op.execute(
        """
        CREATE TABLE issue_embeddings (
            issue_id INTEGER PRIMARY KEY REFERENCES issues (issue_id) ON DELETE CASCADE,
            embedding vector(1536) NOT NULL,
            source_key TEXT NOT NULL
        )
        """
    )
    op.execute("ALTER TABLE bill_embeddings ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE issue_embeddings ENABLE ROW LEVEL SECURITY")
    # One embedding request can cover several bills or a batch of topics.
    op.execute("ALTER TABLE ai_calls ALTER COLUMN bill_id DROP NOT NULL")
    op.execute(
        """
        CREATE VIEW bill_embedding_inputs WITH (security_invoker = true) AS
        SELECT b.bill_id, b.title, summary.text AS summary,
               md5(jsonb_build_array(b.title, summary.text)::text) AS source_key
        FROM bills b
        LEFT JOIN LATERAL (
            SELECT text FROM bill_summaries
            WHERE bill_id = b.bill_id
            ORDER BY action_date DESC NULLS LAST, version_code DESC
            LIMIT 1
        ) summary ON true
        """
    )
    op.execute(
        """
        CREATE VIEW issue_embedding_inputs WITH (security_invoker = true) AS
        SELECT issue_id, name, keywords,
               md5(jsonb_build_array(name, keywords)::text) AS source_key
        FROM issues
        """
    )


def downgrade() -> None:
    """Remove the feed embeddings and their input views."""
    op.execute("DROP VIEW issue_embedding_inputs, bill_embedding_inputs")
    op.execute("DROP TABLE issue_embeddings, bill_embeddings")
    op.execute("DELETE FROM ai_calls WHERE bill_id IS NULL")
    op.execute("ALTER TABLE ai_calls ALTER COLUMN bill_id SET NOT NULL")
