"""Match ZIP codes to the 119th Congress districts that overlap them.

The data comes from the Census Bureau's relationship file between 2020 ZIP Code Tabulation
Areas and 119th Congress districts. A ZCTA approximates a USPS ZIP code, and one ZCTA can
overlap several districts, so a lookup returns every district covering at least one percent of
the ZIP's land, largest first. Smaller overlaps are boundary slivers rather than neighborhoods.
Rebuild the data file after Census publishes a new relationship file:

    uv run --directory backend python -m app.zip_districts
"""

import csv
from functools import cache
from pathlib import Path

import httpx

SOURCE_URL = (
    "https://www2.census.gov/geo/docs/maps-data/data/rel2020/cd-sld/tab20_cd11920_zcta520_natl.txt"
)
DATA_FILE = Path(__file__).with_name("data") / "zip_districts.csv"
MIN_LAND_SHARE = 0.01

STATE_FIPS = {
    "01": "AL", "02": "AK", "04": "AZ", "05": "AR", "06": "CA", "08": "CO", "09": "CT",
    "10": "DE", "11": "DC", "12": "FL", "13": "GA", "15": "HI", "16": "ID", "17": "IL",
    "18": "IN", "19": "IA", "20": "KS", "21": "KY", "22": "LA", "23": "ME", "24": "MD",
    "25": "MA", "26": "MI", "27": "MN", "28": "MS", "29": "MO", "30": "MT", "31": "NE",
    "32": "NV", "33": "NH", "34": "NJ", "35": "NM", "36": "NY", "37": "NC", "38": "ND",
    "39": "OH", "40": "OK", "41": "OR", "42": "PA", "44": "RI", "45": "SC", "46": "SD",
    "47": "TN", "48": "TX", "49": "UT", "50": "VT", "51": "VA", "53": "WA", "54": "WV",
    "55": "WI", "56": "WY", "60": "AS", "66": "GU", "69": "MP", "72": "PR", "78": "VI",
}  # fmt: skip


@cache
def zip_table() -> dict[str, list[tuple[str, int | None]]]:
    """Return each ZIP code's districts as postal state and district number, largest first."""
    table: dict[str, list[tuple[str, int | None]]] = {}
    with DATA_FILE.open(newline="") as source:
        for row in csv.DictReader(source):
            district = int(row["district"])
            table.setdefault(row["zip"], []).append((row["state"], district or None))
    return table


def districts_for_zip(zip_code: str) -> list[tuple[str, int | None]]:
    """Return the districts overlapping a five-digit ZIP code, or an empty list if unknown."""
    return zip_table().get(zip_code, [])


@cache
def state_table() -> dict[str, list[tuple[str, int | None]]]:
    """Return each state's districts in number order, from the same ZIP data."""
    table: dict[str, set[tuple[str, int | None]]] = {}
    for districts in zip_table().values():
        for state, district in districts:
            table.setdefault(state, set()).add((state, district))
    return {state: sorted(seats, key=lambda seat: seat[1] or 0) for state, seats in table.items()}


def districts_in_state(state: str) -> list[tuple[str, int | None]]:
    """Return every district in a state or territory, or an empty list if unknown."""
    return state_table().get(state, [])


def build_rows(lines: list[str]) -> list[tuple[str, str, int]]:
    """Return ZIP, state and district rows from the Census relationship file's lines."""
    land: dict[str, dict[tuple[str, int], int]] = {}
    for line in lines[1:]:
        fields = line.rstrip("\n").split("|")
        geoid, zip_code, land_part = fields[1], fields[8], fields[15]
        state = STATE_FIPS.get(geoid[:2])
        # Rows without a ZCTA are district parts outside any ZIP area, and ZZ marks water.
        if not zip_code or not state or not geoid[2:].isdigit():
            continue
        # The file codes at-large seats 00 and the nonvoting delegate seats 98.
        district = int(geoid[2:]) if geoid[2:] not in {"00", "98"} else 0
        overlaps = land.setdefault(zip_code, {})
        overlaps[(state, district)] = overlaps.get((state, district), 0) + int(land_part or 0)
    rows = []
    for zip_code, overlaps in sorted(land.items()):
        total = sum(overlaps.values())
        ranked = sorted(overlaps.items(), key=lambda item: -item[1])
        kept = [key for key, area in ranked if total == 0 or area >= MIN_LAND_SHARE * total]
        rows.extend((zip_code, state, district) for state, district in kept)
    return rows


def main() -> int:
    """Download the Census relationship file and rewrite the ZIP data file."""
    response = httpx.get(SOURCE_URL, timeout=60.0)
    response.raise_for_status()
    rows = build_rows(response.content.decode("utf-8-sig").splitlines())
    DATA_FILE.parent.mkdir(exist_ok=True)
    with DATA_FILE.open("w", newline="") as target:
        writer = csv.writer(target, lineterminator="\n")
        writer.writerow(["zip", "state", "district"])
        writer.writerows(rows)
    zip_count = len({row[0] for row in rows})
    print(f"Wrote {len(rows)} ZIP and district pairs for {zip_count} ZIP codes.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
