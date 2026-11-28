"""Decide which reviews appear in public lists and summaries."""

# Reports from this many different signed-in people withhold a review until the team looks.
# Visitors' reports are recorded too, but one person could send any number of them.
WITHHOLD_AFTER_REPORTS = 3

# A review is shared when its author chose to list it publicly, has not hidden it and reports
# have not withheld it. Consent to the office brief (consent_to_share) is a separate choice.
SHARED_REVIEW_SQL = f"""
    r.share_publicly AND r.hidden_at IS NULL AND r.moderation_status = 'cleared'
    AND (SELECT count(*) FROM review_reports rr
         WHERE rr.review_id = r.review_id
           AND rr.reporter_uid IS NOT NULL AND rr.dismissed_at IS NULL)
        < {WITHHOLD_AFTER_REPORTS}
"""
