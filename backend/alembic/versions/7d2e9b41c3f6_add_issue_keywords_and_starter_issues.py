"""Add keywords to issues and the starter list of issues people can choose."""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "7d2e9b41c3f6"
down_revision: str | Sequence[str] | None = "c1330ddf4710"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# The first feed matches these words in bill titles and summaries
STARTER_ISSUES = {
    "Health care": [
        "health care",
        "healthcare",
        "medicare",
        "medicaid",
        "hospital",
        "hospitals",
        "prescription",
        "prescriptions",
        "mental health",
    ],
    "Housing": [
        "housing",
        "rent",
        "renters",
        "mortgage",
        "mortgages",
        "homeless",
        "homelessness",
        "affordable homes",
    ],
    "Jobs and wages": [
        "job",
        "jobs",
        "employment",
        "unemployment",
        "wage",
        "wages",
        "workforce",
        "workers",
        "layoffs",
        "labor",
    ],
    "Education": [
        "education",
        "school",
        "schools",
        "student",
        "students",
        "college",
        "colleges",
        "teacher",
        "teachers",
    ],
    "Climate and energy": [
        "climate",
        "energy",
        "emissions",
        "renewable",
        "solar",
        "wind power",
        "electricity",
        "carbon",
    ],
    "Immigration": [
        "immigration",
        "immigrant",
        "immigrants",
        "asylum",
        "visa",
        "visas",
        "border security",
        "citizenship",
    ],
    "Taxes": ["tax", "taxes", "taxpayer", "taxpayers", "internal revenue", "irs"],
    "Veterans": ["veteran", "veterans", "va benefits", "military families"],
    "Technology and AI": [
        "artificial intelligence",
        "ai",
        "technology",
        "privacy",
        "data security",
        "cybersecurity",
        "broadband",
        "algorithm",
        "algorithms",
    ],
    "Civil rights": [
        "civil rights",
        "voting rights",
        "discrimination",
        "equal protection",
        "disability rights",
    ],
    "Public safety": [
        "public safety",
        "police",
        "policing",
        "firearm",
        "firearms",
        "gun",
        "guns",
        "crime",
    ],
    "Retirement and Social Security": [
        "social security",
        "retirement",
        "pension",
        "pensions",
        "seniors",
    ],
}


def upgrade() -> None:
    """Add the keywords column and insert the starter issues."""
    op.execute("ALTER TABLE issues ADD COLUMN keywords TEXT[] NOT NULL DEFAULT '{}'")
    insert = sa.text("INSERT INTO issues (name, keywords) VALUES (:name, :keywords)")
    for name, keywords in STARTER_ISSUES.items():
        op.execute(insert.bindparams(name=name, keywords=keywords))


def downgrade() -> None:
    """Remove the starter issues and the keywords column."""
    delete = sa.text("DELETE FROM issues WHERE name = :name")
    for name in STARTER_ISSUES:
        op.execute(delete.bindparams(name=name))
    op.execute("ALTER TABLE issues DROP COLUMN keywords")
