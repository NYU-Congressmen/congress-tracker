import pytest

from app.sync.status import status_from_action


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
