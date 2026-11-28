"""Turn new official actions on tracked bills into in-app notifications."""

from typing import Any

import psycopg

# One notification per tracker for each latest action recorded after they started tracking.
# The message identifies the action by date and text. The unique index handles overlapping
# writes, and the existing-row check avoids reserving new IDs on routine sync runs.
NOTIFY_SQL = """
    INSERT INTO notifications (uid, bill_id, type, message)
    SELECT t.uid, b.bill_id, 'latest_action', m.message
    FROM tracked_bills t
    JOIN bills b ON b.bill_id = t.bill_id
    CROSS JOIN LATERAL (
        SELECT to_char(b.latest_action_date, 'Mon FMDD, YYYY') || ': ' || b.latest_action_text
            AS message
    ) m
    WHERE b.latest_action_date > t.followed_at::date
      AND b.latest_action_text IS NOT NULL
      AND (%(bill_id)s::text IS NULL OR b.bill_id = %(bill_id)s)
      AND NOT EXISTS (
          SELECT 1 FROM notifications n
          WHERE n.uid = t.uid AND n.bill_id = b.bill_id
            AND n.type = 'latest_action' AND n.message = m.message
      )
    ON CONFLICT (uid, bill_id, md5(message)) WHERE type = 'latest_action' AND bill_id IS NOT NULL
    DO NOTHING
"""


def notify_tracked_updates(conn: psycopg.Connection[Any], bill_id: str | None = None) -> int:
    """Notify each tracker of a bill whose latest action is new to them, and return how many."""
    return conn.execute(NOTIFY_SQL, {"bill_id": bill_id}).rowcount
