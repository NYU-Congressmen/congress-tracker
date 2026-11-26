"""Track review moderation while preserving authors' text and visibility choices."""

from alembic import op

revision = "9d42e3a17c6b"
down_revision = "b5d81f0c3a62"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add moderation state and a view for review readers outside the author's account."""
    op.execute(
        """
        ALTER TABLE reviews
            ADD COLUMN moderation_status TEXT NOT NULL DEFAULT 'pending'
                CHECK (moderation_status IN ('pending', 'flagged', 'held', 'cleared')),
            ADD COLUMN moderation_revision INTEGER NOT NULL DEFAULT 1,
            ADD COLUMN moderation_flags TEXT[] NOT NULL DEFAULT '{}'
        """
    )
    op.execute(
        "UPDATE reviews SET moderation_status = 'cleared' "
        "WHERE story IS NULL AND action_taken IS NULL"
    )
    op.execute(
        """
        CREATE FUNCTION queue_review_text() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
            IF TG_OP = 'UPDATE' THEN
                IF (NEW.story, NEW.action_taken) IS NOT DISTINCT FROM (OLD.story, OLD.action_taken)
                THEN
                    RETURN NEW;
                END IF;
                NEW.moderation_revision := OLD.moderation_revision + 1;
            END IF;
            NEW.moderation_status := CASE
                WHEN NEW.story IS NULL AND NEW.action_taken IS NULL THEN 'cleared'
                ELSE 'pending'
            END;
            NEW.moderation_flags := '{}';
            RETURN NEW;
        END;
        $$
        """
    )
    op.execute(
        """
        CREATE TRIGGER queue_review_text BEFORE INSERT OR UPDATE OF story, action_taken ON reviews
        FOR EACH ROW EXECUTE FUNCTION queue_review_text()
        """
    )
    op.execute(
        """
        CREATE VIEW visible_reviews WITH (security_invoker = true) AS
        SELECT review_id, uid, bill_id, stance, story, action_taken, consent_to_share,
               created_at, updated_at
        FROM reviews WHERE hidden_at IS NULL AND moderation_status = 'cleared'
        """
    )


def downgrade() -> None:
    """Remove moderation metadata while keeping the review text and author visibility settings."""
    op.execute("DROP VIEW visible_reviews")
    op.execute("DROP TRIGGER queue_review_text ON reviews")
    op.execute("DROP FUNCTION queue_review_text()")
    op.execute(
        "ALTER TABLE reviews DROP COLUMN moderation_status, DROP COLUMN moderation_revision, "
        "DROP COLUMN moderation_flags"
    )
