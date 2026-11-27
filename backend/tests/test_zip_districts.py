from app.zip_districts import build_rows, districts_for_zip, districts_in_state

HEADER = "|".join(["OID", "GEOID_CD", *["x"] * 6, "GEOID_ZCTA", *["x"] * 6, "LAND", "WATER"])


def relationship_line(district_geoid: str, zip_code: str, land: int) -> str:
    """Return one line of the Census relationship file with the fields the build reads."""
    fields = ["1", district_geoid, *[""] * 6, zip_code, *[""] * 6, str(land), "0"]
    return "|".join(fields)


def test_build_keeps_overlaps_of_at_least_one_percent_largest_first():
    lines = [
        HEADER,
        relationship_line("3607", "11201", 300),
        relationship_line("3610", "11201", 700),
        relationship_line("3608", "11201", 5),
        relationship_line("36ZZ", "11201", 0),
        relationship_line("1198", "20001", 100),
        relationship_line("3612", "", 900),
    ]
    assert build_rows(lines) == [
        ("11201", "NY", 10),
        ("11201", "NY", 7),
        ("20001", "DC", 0),
    ]


def test_bundled_data_lists_every_district_for_a_split_zip():
    assert districts_for_zip("10001") == [("NY", 12)]
    assert districts_for_zip("11201") == [("NY", 10), ("NY", 7)]
    assert districts_for_zip("99501") == [("AK", None)]
    assert districts_for_zip("00000") == []


def test_state_districts_come_in_number_order():
    assert districts_in_state("NY")[:3] == [("NY", 1), ("NY", 2), ("NY", 3)]
    assert len(districts_in_state("NY")) == 26
    assert districts_in_state("WY") == [("WY", None)]
