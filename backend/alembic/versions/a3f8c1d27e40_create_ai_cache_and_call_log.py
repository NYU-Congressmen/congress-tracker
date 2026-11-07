"""Create the AI result cache and the log of model calls."""

from collections.abc import Sequence

from alembic import op

revision: str = "a3f8c1d27e40"
down_revision: str | Sequence[str] | None = "7d2e9b41c3f6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Create ai_results for cached answers and ai_calls for every real model call."""
    op.execute(
        """
        CREATE TABLE ai_results (
            -- A hash of the feature, prompt version, model and exact messages
            cache_key       TEXT PRIMARY KEY,
            -- The feature that asked, such as explanation
            feature         TEXT NOT NULL,
            bill_id         TEXT NOT NULL REFERENCES bills (bill_id) ON DELETE CASCADE,
            model           TEXT NOT NULL,
            prompt_version  TEXT NOT NULL,
            result          JSONB NOT NULL,
            -- How many times the cache answered, for measuring the hit rate
            hits            INTEGER NOT NULL DEFAULT 0,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )
    op.execute(
        """
        CREATE TABLE ai_calls (
            call_id        SERIAL PRIMARY KEY,
            feature        TEXT NOT NULL,
            bill_id        TEXT NOT NULL REFERENCES bills (bill_id) ON DELETE CASCADE,
            model          TEXT NOT NULL,
            input_tokens   INTEGER NOT NULL DEFAULT 0,
            output_tokens  INTEGER NOT NULL DEFAULT 0,
            -- Empty when the model has no known price
            cost_usd       NUMERIC(12, 6),
            seconds        NUMERIC(8, 3) NOT NULL,
            succeeded      BOOLEAN NOT NULL,
            -- The error's type when the call failed
            error          TEXT,
            created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )
    op.execute("CREATE INDEX ai_results_bill_id_idx ON ai_results (bill_id)")
    op.execute("CREATE INDEX ai_calls_bill_id_idx ON ai_calls (bill_id)")
    op.execute("ALTER TABLE ai_results ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE ai_calls ENABLE ROW LEVEL SECURITY")


def downgrade() -> None:
    """Drop the AI call log and the result cache."""
    op.execute("DROP TABLE ai_calls")
    op.execute("DROP TABLE ai_results")
