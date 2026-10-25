import pytest

from app.sync.status import furthest_status, status_from_action


@pytest.mark.parametrize(
    ("action_type", "text", "expected"),
    [
        (None, "Introduced in House", "introduced"),
        ("IntroReferral", "Referred to the House Committee on Energy and Commerce.", "committee"),
        # A procedural rule passing is not the bill passing
        ("Floor", "Rule H. Res. 436 passed House.", "introduced"),
        (
            "Floor",
            "Passed/agreed to in House: On passage Passed by recorded vote: 215 - 214.",
            "passed_house",
        ),
        # Reaching the Senate means it passed the House, even though "committee" appears too
        (
            "IntroReferral",
            "Received in the Senate and Read twice and referred to the Committee on Finance.",
            "passed_house",
        ),
        ("Floor", "Passed/agreed to in Senate: Passed Senate with an amendment.", "passed_senate"),
        ("Floor", "Presented to President.", "to_president"),
        ("BecameLaw", "Became Public Law No: 119-21.", "became_law"),
    ],
)
def test_status_from_action(action_type, text, expected):
    assert status_from_action(action_type, text) == expected


@pytest.mark.parametrize(
    ("text", "bill_type", "expected"),
    [
        # A bill held at the desk or on the Senate calendar has passed the other chamber
        ("Held at the desk.", "hr", "passed_house"),
        ("Held at the desk.", "s", "passed_senate"),
        ("Placed on Senate Legislative Calendar under General Orders.", "hr", "passed_house"),
        # A Senate bill on the Senate calendar has only been reported by committee
        ("Placed on Senate Legislative Calendar under General Orders.", "s", "committee"),
        ("Reported by the Committee on Ways and Means.", "hr", "committee"),
        ("Placed on the Union Calendar, Calendar No. 12.", "hr", "committee"),
        ("Signed by President.", "hr", "to_president"),
    ],
)
def test_status_from_action_with_bill_type(text, bill_type, expected):
    assert status_from_action(None, text, bill_type) == expected


def test_furthest_status_takes_the_latest_stage_reached():
    actions = [
        {"type": "IntroReferral", "text": "Referred to the Committee on Finance."},
        {"type": "Floor", "text": "Passed/agreed to in House: On passage."},
        {"type": "Floor", "text": "Motion to reconsider laid on the table."},
    ]
    assert furthest_status(actions, "hr") == "passed_house"
    assert furthest_status([], "hr") == "introduced"
