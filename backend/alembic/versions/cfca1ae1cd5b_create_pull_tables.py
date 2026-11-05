"""create pull tables

Revision ID: cfca1ae1cd5b
Revises: b71e8a40d192
Create Date: 2026-11-05 10:32:42.981105

"""

from collections.abc import Sequence

# Keep op available for the SQL added to upgrade and downgrade.
from alembic import op  # noqa: F401

# revision identifiers, used by Alembic.
revision: str = "cfca1ae1cd5b"
down_revision: str | Sequence[str] | None = "b71e8a40d192"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Parents before children, so the downgrade drops them in reverse
PULL_TABLES = (
    "users",
    "issues",
    "user_issues",
    "reviews",
    "actions",
    "tracked_bills",
    "notifications",
    "text_versions",
    "briefs",
    "post_cards",
)


def upgrade() -> None:
    """Create the tables for Pull's users, reviews, follow-through and weekly briefs."""
    # Only the extension for now; the embedding columns come with the embedding model (A8)
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    op.execute(
        """
        CREATE TABLE users (
            uid         TEXT PRIMARY KEY,         -- Firebase Auth UID
            phone       TEXT NOT NULL UNIQUE,     -- one account per phone number
            state       TEXT,                     -- two-letter code, from the address
            district    INTEGER,                  -- 0 for at-large, 98 for DC and territories
            created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )
    op.execute(
        """
        CREATE TABLE issues (
            issue_id  SERIAL PRIMARY KEY,
            name      TEXT NOT NULL UNIQUE      -- e.g. Health, Housing
        )
        """
    )
    op.execute(
        """
        CREATE TABLE user_issues (
            uid       TEXT NOT NULL REFERENCES users (uid) ON DELETE CASCADE,
            issue_id  INTEGER NOT NULL REFERENCES issues (issue_id) ON DELETE CASCADE,
            PRIMARY KEY (uid, issue_id)
        )
        """
    )
    op.execute(
        """
        CREATE TABLE reviews (
            review_id         SERIAL PRIMARY KEY,
            uid               TEXT NOT NULL REFERENCES users (uid) ON DELETE CASCADE,
            bill_id           TEXT NOT NULL REFERENCES bills (bill_id) ON DELETE CASCADE,
            stance            TEXT NOT NULL CHECK (stance IN ('support', 'oppose', 'unsure')),
            story             TEXT,                 -- no length cap, it is what people share
            action_taken      TEXT,                 -- what the user did about it, in their words
            consent_to_share  BOOLEAN NOT NULL DEFAULT false,
            hidden_at         TIMESTAMPTZ,          -- set when hidden, empty while visible
            created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
            UNIQUE (uid, bill_id)
        )
        """
    )
    op.execute(
        """
        CREATE TABLE actions (
            action_id    SERIAL PRIMARY KEY,
            uid          TEXT NOT NULL REFERENCES users (uid) ON DELETE CASCADE,
            bill_id      TEXT NOT NULL REFERENCES bills (bill_id) ON DELETE CASCADE,
            bioguide_id  TEXT NOT NULL REFERENCES members (bioguide_id),
            action_type  TEXT NOT NULL,          -- e.g. call
            created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )
    op.execute(
        """
        CREATE TABLE tracked_bills (
            uid           TEXT NOT NULL REFERENCES users (uid) ON DELETE CASCADE,
            bill_id       TEXT NOT NULL REFERENCES bills (bill_id) ON DELETE CASCADE,
            followed_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
            last_seen_at  TIMESTAMPTZ,              -- last time the user opened the bill
            PRIMARY KEY (uid, bill_id)
        )
        """
    )
    op.execute(
        """
        CREATE TABLE notifications (
            notification_id  SERIAL PRIMARY KEY,
            uid              TEXT NOT NULL REFERENCES users (uid) ON DELETE CASCADE,
            bill_id          TEXT REFERENCES bills (bill_id) ON DELETE CASCADE,
            type             TEXT NOT NULL,         -- e.g. status_change, vote_scheduled
            message          TEXT NOT NULL,
            is_read          BOOLEAN NOT NULL DEFAULT false,
            created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )
    op.execute(
        """
        CREATE TABLE text_versions (
            bill_id       TEXT NOT NULL REFERENCES bills (bill_id) ON DELETE CASCADE,
            version_type  TEXT NOT NULL,            -- e.g. Introduced in House
            version_date  TIMESTAMPTZ,
            pdf_url       TEXT,
            xml_url       TEXT,
            text          TEXT,                     -- filled once downloaded, empty until then
            PRIMARY KEY (bill_id, version_type)
        )
        """
    )
    op.execute(
        """
        CREATE TABLE briefs (
            brief_id       SERIAL PRIMARY KEY,
            bioguide_id    TEXT NOT NULL REFERENCES members (bioguide_id),  -- the office
            bill_id        TEXT NOT NULL REFERENCES bills (bill_id) ON DELETE CASCADE,
            week_start     DATE NOT NULL,           -- the Monday of the week covered
            support_count  INTEGER NOT NULL DEFAULT 0,
            oppose_count   INTEGER NOT NULL DEFAULT 0,
            unsure_count   INTEGER NOT NULL DEFAULT 0,
            action_count   INTEGER NOT NULL DEFAULT 0,
            content        TEXT,                    -- the written Constituent Signal brief
            sent_at        TIMESTAMPTZ,             -- empty until it is sent to the office
            created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
            UNIQUE (bioguide_id, bill_id, week_start)
        )
        """
    )
    op.execute(
        """
        CREATE TABLE post_cards (
            post_card_id    SERIAL PRIMARY KEY,
            review_id       INTEGER NOT NULL REFERENCES reviews (review_id) ON DELETE CASCADE,
            platform        TEXT NOT NULL,          -- e.g. bluesky
            post_url        TEXT,
            hidden_on_pull  BOOLEAN NOT NULL DEFAULT false,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )

    # The unique keys above already cover lookups by user, so these cover the other direction
    op.execute("CREATE INDEX reviews_bill_id_idx ON reviews (bill_id)")
    op.execute(
        "CREATE INDEX actions_bioguide_id_created_at_idx ON actions (bioguide_id, created_at)"
    )
    op.execute("CREATE INDEX actions_uid_idx ON actions (uid)")
    op.execute("CREATE INDEX tracked_bills_bill_id_idx ON tracked_bills (bill_id)")
    op.execute("CREATE INDEX notifications_uid_idx ON notifications (uid)")
    op.execute("CREATE INDEX post_cards_review_id_idx ON post_cards (review_id)")

    for table in PULL_TABLES:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")


def downgrade() -> None:
    """Drop the Pull tables, children before parents, then the extension."""
    for table in reversed(PULL_TABLES):
        op.execute(f"DROP TABLE {table}")
    op.execute("DROP EXTENSION IF EXISTS vector")
