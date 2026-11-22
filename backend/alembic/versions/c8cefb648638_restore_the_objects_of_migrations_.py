"""restore the objects of migrations skipped after reordering

Revision ID: c8cefb648638
Revises: 4b30c96e82af
Create Date: 2026-11-22 13:22:19.029764

Supabase recorded the K migrations (6d6057f17577 onward) while they still followed
46b919d6d069. They were later moved after 6eb1f4b23392 to keep one head, so Alembic
treated 2aa5b64a1f0d, 3f98c029ce75 and 6eb1f4b23392 as applied and never ran them there.
This revision creates whatever those three left out and changes nothing on a database that
already has it, such as one built from scratch.

Lesson for later: when two branches' migrations meet, add `alembic merge` instead of
changing a migration's down_revision, because a shared database may already have run it.
"""

from collections.abc import Sequence

# Keep op available for the SQL added to upgrade and downgrade.
from alembic import op  # noqa: F401

# revision identifiers, used by Alembic.
revision: str = "c8cefb648638"
down_revision: str | Sequence[str] | None = "4b30c96e82af"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Create the feed embeddings and call log columns if an earlier migration was skipped."""
    # From 2aa5b64a1f0d: vectors for bills and topics, and their current inputs
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS bill_embeddings (
            bill_id TEXT PRIMARY KEY REFERENCES bills (bill_id) ON DELETE CASCADE,
            embedding vector(1536) NOT NULL,
            source_key TEXT NOT NULL
        )
        """
    )
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS issue_embeddings (
            issue_id INTEGER PRIMARY KEY REFERENCES issues (issue_id) ON DELETE CASCADE,
            embedding vector(1536) NOT NULL,
            source_key TEXT NOT NULL
        )
        """
    )
    op.execute("ALTER TABLE bill_embeddings ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE issue_embeddings ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE ai_calls ALTER COLUMN bill_id DROP NOT NULL")
    # Same definitions as 2aa5b64a1f0d, so replacing an existing view changes nothing
    op.execute(
        """
        CREATE OR REPLACE VIEW bill_embedding_inputs WITH (security_invoker = true) AS
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
        CREATE OR REPLACE VIEW issue_embedding_inputs WITH (security_invoker = true) AS
        SELECT issue_id, name, keywords,
               md5(jsonb_build_array(name, keywords)::text) AS source_key
        FROM issues
        """
    )

    # From 3f98c029ce75 and 6eb1f4b23392: retry-safe request IDs and notes on logged calls
    op.execute("ALTER TABLE actions ADD COLUMN IF NOT EXISTS request_id UUID")
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint
                WHERE conrelid = 'actions'::regclass AND contype = 'u'
                  AND conkey = ARRAY[
                      (SELECT attnum FROM pg_attribute
                       WHERE attrelid = 'actions'::regclass AND attname = 'uid'),
                      (SELECT attnum FROM pg_attribute
                       WHERE attrelid = 'actions'::regclass AND attname = 'request_id')
                  ]::smallint[]
            ) THEN
                ALTER TABLE actions ADD CONSTRAINT actions_uid_request_id_key
                    UNIQUE (uid, request_id);
            END IF;
        END $$
        """
    )
    op.execute("ALTER TABLE actions ADD COLUMN IF NOT EXISTS call_note TEXT")


def downgrade() -> None:
    """Leave everything in place, because these objects belong to the earlier migrations.

    Their own downgrades remove them, so undoing this revision alone must not.
    """
