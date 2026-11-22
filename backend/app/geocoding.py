"""Resolve street addresses against the same Congress as Pull's member directory."""

import re
import threading
from collections import deque
from collections.abc import Iterator
from contextlib import contextmanager
from time import monotonic

import httpx
from fastapi import HTTPException

from app.models import AccountDistrict

CENSUS_URL = "https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress"
DISTRICT_LAYER = "119th Congressional Districts"


class LookupLimiter:
    """Cap the Census lookups one API instance makes at once and in each minute.

    Anyone can look up an address before signing up, and each lookup holds a worker for up
    to six seconds. Visitors reach Cloud Run through Firebase's proxies, where a forwarded
    address can be spoofed, so the cap is per instance rather than per visitor. It keeps one
    client from tying up the API or flooding the Census Bureau, though such a client can still
    use up a minute's lookups for everyone else.
    """

    def __init__(self, in_flight: int = 4, per_minute: int = 60) -> None:
        self.max_in_flight = in_flight
        self.max_per_minute = per_minute
        self.in_flight = 0
        self.started: deque[float] = deque()
        self.lock = threading.Lock()

    @contextmanager
    def slot(self) -> Iterator[None]:
        """Hold one lookup slot, or answer 429 when the instance is at either limit."""
        now = monotonic()
        with self.lock:
            while self.started and now - self.started[0] >= 60:
                self.started.popleft()
            if self.in_flight >= self.max_in_flight or len(self.started) >= self.max_per_minute:
                raise HTTPException(
                    429,
                    "Too many district lookups right now. Try again in a minute.",
                    headers={"Retry-After": "60"},
                )
            self.in_flight += 1
            self.started.append(now)
        try:
            yield
        finally:
            with self.lock:
                self.in_flight -= 1


limiter = LookupLimiter()


def district_for_address(address: str) -> AccountDistrict:
    """Return the postal state and 119th Congress district for an unambiguous address."""
    try:
        with limiter.slot():
            response = httpx.get(
                CENSUS_URL,
                params={
                    "address": address,
                    "benchmark": "Public_AR_Current",
                    # The current geography dataset can switch Congresses before the member
                    # directory.
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
