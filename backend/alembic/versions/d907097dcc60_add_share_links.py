"""add share links

Revision ID: d907097dcc60
Revises: 91ec502a9a9f
Create Date: 2026-11-22 08:42:40.157625

"""

from collections.abc import Sequence

# Keep op available for the SQL added to upgrade and downgrade.
from alembic import op  # noqa: F401

# revision identifiers, used by Alembic.
revision: str = "d907097dcc60"
down_revision: str | Sequence[str] | None = "91ec502a9a9f"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Give each review one share link per platform and tie found posts to their link."""
    op.execute(
        """
        CREATE TABLE share_links (
            -- The random part of the link, as in /s/k3Xa9QpL
            code             TEXT PRIMARY KEY,
            review_id        INTEGER NOT NULL REFERENCES reviews (review_id) ON DELETE CASCADE,
            -- Where the author said they would share it, which is what the visits count by
            platform         TEXT NOT NULL CHECK (
                platform IN ('bluesky', 'x', 'mastodon', 'threads', 'instagram', 'tiktok',
                             'facebook', 'linkedin', 'other')
            ),
            -- Visits from people, leaving out link-preview robots
            visits           INTEGER NOT NULL DEFAULT 0,
            last_visited_at  TIMESTAMPTZ,
            -- When Pull's Bluesky account last searched for posts with this link
            searched_at      TIMESTAMPTZ,
            created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
            UNIQUE (review_id, platform)
        )
        """
    )
    # The link a found post carried, kept when the link is deleted so the badge survives
    op.execute(
        "ALTER TABLE post_cards ADD COLUMN share_code TEXT"
        " REFERENCES share_links (code) ON DELETE SET NULL"
    )
    op.execute("ALTER TABLE post_cards ADD COLUMN posted_at TIMESTAMPTZ")
    # A post is recorded once however many searches find it
    op.execute("ALTER TABLE post_cards ADD CONSTRAINT post_cards_post_url_key UNIQUE (post_url)")
    op.execute("ALTER TABLE share_links ENABLE ROW LEVEL SECURITY")


def downgrade() -> None:
    """Drop the share links and the post columns that point to them."""
    op.execute("ALTER TABLE post_cards DROP CONSTRAINT post_cards_post_url_key")
    op.execute("ALTER TABLE post_cards DROP COLUMN posted_at")
    op.execute("ALTER TABLE post_cards DROP COLUMN share_code")
    op.execute("DROP TABLE share_links")
