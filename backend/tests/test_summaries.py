from app.sync.summaries import clean_summary

# Trimmed from a real /summaries/119 response
SUMMARY = {
    "actionDate": "2026-02-11",
    "actionDesc": "Introduced in Senate",
    "bill": {"congress": 119, "number": "3848", "type": "S"},
    "text": "<p><strong>Apples to Apples Comparison Act of 2026</strong></p>",
    "updateDate": "2026-11-05T14:00:00Z",
    "versionCode": "00",
}


def test_clean_summary():
    row = clean_summary(SUMMARY)
    assert row["bill_id"] == "119-s-3848"  # same key as the bills table, lowercase
    assert row["version_code"] == "00"  # text, so the leading zero survives
    assert row["action_date"] == "2026-02-11"
    assert row["text"].startswith("<p>")  # stored as the HTML CRS wrote
