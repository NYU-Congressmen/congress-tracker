"""Add upstream cache versions, retry deadlines and independent chamber passage."""

from alembic import op

revision = "b71e8a40d192"
down_revision = "803cfe036e6c"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add cache controls and convert chamber-specific statuses to independent milestones."""
    op.execute("ALTER TABLE bills ADD COLUMN details_update_date TIMESTAMPTZ")
    op.execute("ALTER TABLE bills ADD COLUMN details_retry_after TIMESTAMPTZ")
    op.execute("ALTER TABLE members ADD COLUMN sponsored_retry_after TIMESTAMPTZ")
    op.execute("ALTER TABLE bills ADD COLUMN passed_house BOOLEAN NOT NULL DEFAULT false")
    op.execute("ALTER TABLE bills ADD COLUMN passed_senate BOOLEAN NOT NULL DEFAULT false")
    # Existing fetch timestamps and history remain available while versionless caches refresh.
    op.execute("""
        UPDATE bills SET
            passed_house = status IN ('passed_house', 'to_president', 'became_law'),
            passed_senate = status IN ('passed_senate', 'to_president', 'became_law'),
            status = CASE WHEN status IN ('passed_house', 'passed_senate')
                          THEN 'passed_one_chamber' ELSE status END
    """)


def downgrade() -> None:
    """Restore the previous status vocabulary and remove cache controls and passage flags."""
    op.execute("""
        UPDATE bills SET status = CASE
            WHEN status IN ('passed_one_chamber', 'passed_both_chambers')
                THEN CASE WHEN passed_senate THEN 'passed_senate' ELSE 'passed_house' END
            ELSE status END
    """)
    op.execute("ALTER TABLE bills DROP COLUMN passed_senate")
    op.execute("ALTER TABLE bills DROP COLUMN passed_house")
    op.execute("ALTER TABLE members DROP COLUMN sponsored_retry_after")
    op.execute("ALTER TABLE bills DROP COLUMN details_retry_after")
    op.execute("ALTER TABLE bills DROP COLUMN details_update_date")
