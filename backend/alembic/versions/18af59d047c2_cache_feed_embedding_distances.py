"""Store exact bill-to-topic distances for the feed."""

from collections.abc import Sequence

from alembic import op

revision: str = "18af59d047c2"
down_revision: str | Sequence[str] | None = "c8cefb648638"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Populate the distance cache and enable concurrent refreshes."""
    op.execute(
        """
        CREATE MATERIALIZED VIEW feed_embedding_distances AS
        SELECT b.bill_id, i.issue_id, b.source_key AS bill_source_key,
               i.source_key AS issue_source_key, b.embedding <=> i.embedding AS distance
        FROM bill_embeddings b CROSS JOIN issue_embeddings i
        """
    )
    op.execute(
        "CREATE UNIQUE INDEX feed_embedding_distances_pair_idx"
        " ON feed_embedding_distances (bill_id, issue_id)"
    )
    op.execute("REVOKE ALL ON feed_embedding_distances FROM PUBLIC")
    for role in ("anon", "authenticated"):
        op.execute(
            f"""
            DO $$
            BEGIN
                IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '{role}') THEN
                    REVOKE ALL ON feed_embedding_distances FROM {role};
                END IF;
            END $$;
            """
        )


def downgrade() -> None:
    """Remove the feed distance cache."""
    op.execute("DROP MATERIALIZED VIEW feed_embedding_distances")
