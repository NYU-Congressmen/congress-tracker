"""Create the tables for Pull's users, reviews, follow-through and weekly briefs.

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
    # The embedding columns come later, once the embedding model is chosen
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    op.execute(
        """
        CREATE TABLE users (
            -- The Firebase Auth UID
            uid         TEXT PRIMARY KEY,
            -- One account per phone number
            phone       TEXT NOT NULL UNIQUE,
            -- A two-letter code taken from the address
            state       TEXT,
            -- Empty for at-large seats and delegates, to match members.district
            district    INTEGER,
            created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )
    op.execute(
        """
        CREATE TABLE issues (
            issue_id  SERIAL PRIMARY KEY,
            -- An issue a user can follow, such as Health or Housing
            name      TEXT NOT NULL UNIQUE
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
            -- No length cap, because this is what people share
            story             TEXT,
            -- What the user did about the bill, in their own words
            action_taken      TEXT,
            consent_to_share  BOOLEAN NOT NULL DEFAULT false,
            -- Empty while the review is visible
            hidden_at         TIMESTAMPTZ,
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
            -- The kind of action, such as call
            action_type  TEXT NOT NULL,
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
            -- The last time the user opened the bill
            last_seen_at  TIMESTAMPTZ,
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
            -- The kind of update, such as status_change or vote_scheduled
            type             TEXT NOT NULL,
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
            -- The version's name, such as Introduced in House
            version_type  TEXT NOT NULL,
            version_date  TIMESTAMPTZ,
            pdf_url       TEXT,
            xml_url       TEXT,
            -- Empty until the text is downloaded
            text          TEXT,
            PRIMARY KEY (bill_id, version_type)
        )
        """
    )
    op.execute(
        """
        CREATE TABLE briefs (
            brief_id       SERIAL PRIMARY KEY,
            -- The office that receives the brief
            bioguide_id    TEXT NOT NULL REFERENCES members (bioguide_id),
            bill_id        TEXT NOT NULL REFERENCES bills (bill_id) ON DELETE CASCADE,
            -- The Monday of the week covered
            week_start     DATE NOT NULL,
            support_count  INTEGER NOT NULL DEFAULT 0,
            oppose_count   INTEGER NOT NULL DEFAULT 0,
            unsure_count   INTEGER NOT NULL DEFAULT 0,
            action_count   INTEGER NOT NULL DEFAULT 0,
            -- The written Constituent Signal brief
            content        TEXT,
            -- Empty until the brief is sent to the office
            sent_at        TIMESTAMPTZ,
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
            -- The platform, such as bluesky
            platform        TEXT NOT NULL,
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
