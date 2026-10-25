from app.sync.bills import clean_bill

BILL = {
    "congress": 119,
    "type": "HR",
    "number": "1",  # the API sends numbers as text
    "title": "One Big Beautiful Bill Act",
    "introducedDate": "2025-05-20",
    "latestAction": {"actionDate": "2025-07-04", "text": "Became Public Law No: 119-21."},
    "updateDate": "2026-09-19",
}


def test_clean_bill():
    row = clean_bill(BILL)
    assert row["bill_id"] == "119-hr-1"
    assert row["type"] == "hr"
    assert row["number"] == 1  # stored as an integer so bills sort numerically
    assert row["status"] == "became_law"
    assert row["latest_action_date"] == "2025-07-04"
