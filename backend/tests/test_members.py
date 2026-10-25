from app.sync.members import clean_member

HOUSE_MEMBER = {
    "bioguideId": "W000832",
    "name": "Wahab, Aisha",
    "partyName": "Democratic",
    "state": "California",
    "district": 14,
    "depiction": {"imageUrl": "https://example.test/w.jpg"},
    "terms": {"item": [{"chamber": "House of Representatives", "startYear": 2025}]},
}

# Senators have no district, and this one has no photo
SENATOR = {
    "bioguideId": "S000148",
    "name": "Schumer, Charles E.",
    "partyName": "Democratic",
    "state": "New York",
    "terms": {"item": [{"chamber": "Senate", "startYear": 1999}]},
}


def test_clean_house_member():
    assert clean_member(HOUSE_MEMBER) == {
        "bioguide_id": "W000832",
        "name": "Wahab, Aisha",
        "party": "D",
        "state": "CA",
        "chamber": "House",
        "district": 14,
        "image_url": "https://example.test/w.jpg",
    }


def test_clean_senator_without_district_or_photo():
    row = clean_member(SENATOR)
    assert row["chamber"] == "Senate"
    assert row["state"] == "NY"
    assert row["district"] is None
    assert row["image_url"] is None
