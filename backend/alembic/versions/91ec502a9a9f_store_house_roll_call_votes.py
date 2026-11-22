"""store house roll call votes

Revision ID: 91ec502a9a9f
Revises: 9ba68ab7c33d
Create Date: 2026-11-22 08:40:15.084796

"""

from collections.abc import Sequence

# Keep op available for the SQL added to upgrade and downgrade.
from alembic import op  # noqa: F401

# revision identifiers, used by Alembic.
revision: str = "91ec502a9a9f"
down_revision: str | Sequence[str] | None = "9ba68ab7c33d"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Store House roll-call votes on followed bills and each member's recorded position."""
    # The bill's updateDate its actions were last read at, so they are read again only after
    # the bill changes
    op.execute("ALTER TABLE bills ADD COLUMN votes_scanned_at TIMESTAMPTZ")
    op.execute("ALTER TABLE bills ADD COLUMN votes_update_date TIMESTAMPTZ")

    op.execute(
        """
        CREATE TABLE house_votes (
            congress             INTEGER NOT NULL,
            session              INTEGER NOT NULL,
            roll_number          INTEGER NOT NULL,
            -- The bill whose actions listed the vote
            bill_id              TEXT NOT NULL REFERENCES bills (bill_id) ON DELETE CASCADE,
            vote_date            TIMESTAMPTZ,
            -- Such as On Passage, with a result such as Passed
            question             TEXT,
            result               TEXT,
            vote_type            TEXT,
            -- The Clerk's XML record of the vote
            source_url           TEXT,
            -- Empty until the positions are fetched, which happens once, as votes never change
            positions_synced_at  TIMESTAMPTZ,
            PRIMARY KEY (congress, session, roll_number)
        )
        """
    )
    op.execute(
        """
        CREATE TABLE house_vote_positions (
            congress     INTEGER NOT NULL,
            session      INTEGER NOT NULL,
            roll_number  INTEGER NOT NULL,
            bioguide_id  TEXT NOT NULL,
            -- Exactly as recorded: Yea, Nay, Aye, No, Present or Not Voting
            position     TEXT NOT NULL,
            party        TEXT,
            state        TEXT,
            PRIMARY KEY (congress, session, roll_number, bioguide_id),
            FOREIGN KEY (congress, session, roll_number)
                REFERENCES house_votes (congress, session, roll_number) ON DELETE CASCADE
        )
        """
    )
    op.execute("CREATE INDEX house_votes_bill_id_idx ON house_votes (bill_id)")
    op.execute(
        "CREATE INDEX house_vote_positions_bioguide_id_idx ON house_vote_positions (bioguide_id)"
    )
    for table in ("house_votes", "house_vote_positions"):
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")


def downgrade() -> None:
    """Drop the House votes, their positions and the bills' scan columns."""
    op.execute("DROP TABLE house_vote_positions")
    op.execute("DROP TABLE house_votes")
    op.execute("ALTER TABLE bills DROP COLUMN votes_update_date")
    op.execute("ALTER TABLE bills DROP COLUMN votes_scanned_at")
