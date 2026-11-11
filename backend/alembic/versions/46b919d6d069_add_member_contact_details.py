"""add member contact details

Revision ID: 46b919d6d069
Revises: a3f8c1d27e40
Create Date: 2026-11-10 11:03:04.148576

"""

from collections.abc import Sequence

# Keep op available for the SQL added to upgrade and downgrade.
from alembic import op  # noqa: F401

# revision identifiers, used by Alembic.
revision: str = "46b919d6d069"
down_revision: str | Sequence[str] | None = "a3f8c1d27e40"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Store each member's office contact details and the record version they came from."""
    # The member list's updateDate, saved on every sync
    op.execute("ALTER TABLE members ADD COLUMN update_date TIMESTAMPTZ")
    # The updateDate the contact details were fetched at, so only changed members are fetched again
    op.execute("ALTER TABLE members ADD COLUMN contact_update_date TIMESTAMPTZ")
    op.execute("ALTER TABLE members ADD COLUMN office_phone TEXT")
    op.execute("ALTER TABLE members ADD COLUMN office_address TEXT")
    op.execute("ALTER TABLE members ADD COLUMN website_url TEXT")


def downgrade() -> None:
    """Remove the office contact details and their record versions."""
    for column in (
        "website_url",
        "office_address",
        "office_phone",
        "contact_update_date",
        "update_date",
    ):
        op.execute(f"ALTER TABLE members DROP COLUMN {column}")
