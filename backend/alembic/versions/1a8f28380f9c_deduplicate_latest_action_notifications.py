"""Keep one latest-action notification per reader, bill and action."""

from alembic import op

revision = "1a8f28380f9c"
down_revision = "9d42e3a17c6b"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Consolidate duplicate latest-action notifications and prevent new duplicates."""
    # Keep inserts between cleanup and index creation from leaving new duplicates.
    op.execute("LOCK TABLE notifications IN SHARE ROW EXCLUSIVE MODE")
    op.execute(
        """
        DELETE FROM notifications
        WHERE notification_id IN (
            SELECT notification_id FROM (
                SELECT notification_id, row_number() OVER (
                    PARTITION BY uid, bill_id, message
                    ORDER BY is_read DESC, notification_id
                ) AS occurrence
                FROM notifications
                WHERE type = 'latest_action' AND bill_id IS NOT NULL
            ) AS duplicates
            WHERE occurrence > 1
        )
        """
    )
    # Index a fixed-size digest so long Congress.gov action text can still be stored.
    op.execute(
        """
        CREATE UNIQUE INDEX notifications_latest_action_idx
        ON notifications (uid, bill_id, md5(message))
        WHERE type = 'latest_action' AND bill_id IS NOT NULL
        """
    )


def downgrade() -> None:
    """Remove the unique index for latest-action notifications."""
    op.drop_index("notifications_latest_action_idx", table_name="notifications")
