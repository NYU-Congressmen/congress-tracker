"""store bill cosponsors committees and related bills

Revision ID: 6d6057f17577
Revises: 46b919d6d069
Create Date: 2026-11-22 08:34:29.317379

"""

from collections.abc import Sequence

# Keep op available for the SQL added to upgrade and downgrade.
from alembic import op  # noqa: F401

# revision identifiers, used by Alembic.
revision: str = "6d6057f17577"
down_revision: str | Sequence[str] | None = "46b919d6d069"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

GRAPH_TABLES = ("bill_cosponsors", "bill_committees", "related_bills")


def upgrade() -> None:
    """Store who cosponsors a bill, which committees hold it and which bills relate to it."""
    # The bill's updateDate the edges were fetched at, so they refresh only after a change
    op.execute("ALTER TABLE bills ADD COLUMN graph_synced_at TIMESTAMPTZ")
    op.execute("ALTER TABLE bills ADD COLUMN graph_update_date TIMESTAMPTZ")
    op.execute("ALTER TABLE bills ADD COLUMN graph_retry_after TIMESTAMPTZ")

    op.execute(
        """
        CREATE TABLE bill_cosponsors (
            bill_id           TEXT NOT NULL REFERENCES bills (bill_id) ON DELETE CASCADE,
            -- Cosponsors can be former members, so this does not reference members
            bioguide_id       TEXT NOT NULL,
            name              TEXT NOT NULL,
            party             TEXT,
            state             TEXT,
            district          INTEGER,
            sponsorship_date  DATE,
            -- Signed on the day the bill was introduced
            is_original       BOOLEAN NOT NULL DEFAULT false,
            -- Empty while the cosponsorship stands
            withdrawn_date    DATE,
            PRIMARY KEY (bill_id, bioguide_id)
        )
        """
    )
    op.execute(
        """
        CREATE TABLE bill_committees (
            bill_id               TEXT NOT NULL REFERENCES bills (bill_id) ON DELETE CASCADE,
            -- Congress.gov's committee code, such as hsif00, or hsif14 for a subcommittee
            system_code           TEXT NOT NULL,
            name                  TEXT NOT NULL,
            chamber               TEXT,
            type                  TEXT,
            -- The full committee's code when this row is a subcommittee
            parent_code           TEXT,
            -- The committee's most recent step on the bill, such as Referred to or Reported by
            latest_activity       TEXT,
            latest_activity_date  TIMESTAMPTZ,
            PRIMARY KEY (bill_id, system_code)
        )
        """
    )
    op.execute(
        """
        CREATE TABLE related_bills (
            bill_id             TEXT NOT NULL REFERENCES bills (bill_id) ON DELETE CASCADE,
            -- The other bill can be from another Congress, so it may not be stored here
            related_bill_id     TEXT NOT NULL,
            congress            INTEGER NOT NULL,
            type                TEXT NOT NULL,
            number              INTEGER NOT NULL,
            title               TEXT,
            -- Every relationship Congress.gov lists, such as Identical bill; Related bill
            relationship        TEXT NOT NULL,
            identified_by       TEXT,
            latest_action_date  DATE,
            latest_action_text  TEXT,
            PRIMARY KEY (bill_id, related_bill_id)
        )
        """
    )

    # The primary keys cover lookups by bill, so these cover the other direction
    op.execute("CREATE INDEX bill_cosponsors_bioguide_id_idx ON bill_cosponsors (bioguide_id)")
    op.execute("CREATE INDEX bill_committees_system_code_idx ON bill_committees (system_code)")
    op.execute("CREATE INDEX related_bills_related_bill_id_idx ON related_bills (related_bill_id)")

    for table in GRAPH_TABLES:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")


def downgrade() -> None:
    """Drop the bill graph tables and their refresh columns."""
    for table in reversed(GRAPH_TABLES):
        op.execute(f"DROP TABLE {table}")
    for column in ("graph_retry_after", "graph_update_date", "graph_synced_at"):
        op.execute(f"ALTER TABLE bills DROP COLUMN {column}")
