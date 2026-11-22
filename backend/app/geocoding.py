"""Resolve street addresses against the same Congress as Pull's member directory."""

import re

import httpx
from fastapi import HTTPException

from app.models import AccountDistrict

CENSUS_URL = "https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress"
DISTRICT_LAYER = "119th Congressional Districts"


def district_for_address(address: str) -> AccountDistrict:
    """Return the postal state and 119th Congress district for an unambiguous address."""
    try:
        response = httpx.get(
            CENSUS_URL,
            params={
                "address": address,
                "benchmark": "Public_AR_Current",
                # The current geography dataset can switch Congresses before the member directory.
                "vintage": "ACS2025_Current",
                "format": "json",
            },
            timeout=6.0,
        )
        response.raise_for_status()
        matches = response.json()["result"]["addressMatches"]
        if not isinstance(matches, list):
            raise ValueError
        districts = set()
        for match in matches:
            state = match["addressComponents"].get("state", "")
            if not re.fullmatch(r"[A-Z]{2}", state):
                continue
            for geography in match["geographies"].get(DISTRICT_LAYER, []):
                geoid = geography.get("GEOID", "")
                if re.fullmatch(r"[0-9]{4}", geoid):
                    districts.add((state, geoid[-2:]))
    except (httpx.HTTPError, AttributeError, KeyError, TypeError, ValueError):
        # The upstream URL contains the submitted address.
        raise HTTPException(502, "District lookup is unavailable. Try again shortly.") from None
    if len(districts) != 1:
        raise HTTPException(422, "No single congressional district matched that address.")
    state, code = districts.pop()
    return AccountDistrict(state=state, district=None if code in {"00", "98"} else int(code))
