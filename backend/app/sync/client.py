from collections.abc import Callable, Iterator
from time import monotonic
from typing import Any

import httpx

BASE_URL = "https://api.congress.gov/v3"

# The API returns 20 results per page by default and allows at most 250
PAGE_SIZE = 250
TIMEOUT = 30.0

# Each extra pass costs as many requests as the first, so stop after a few
MAX_PASSES = 3


class CongressClient:
    """Wrap the Congress.gov v3 API with authentication, JSON output and paging handled."""

    def __init__(
        self,
        api_key: str,
        transport: httpx.BaseTransport | None = None,
        budget: float | None = None,
    ):
        # The key goes in a header so it never appears in URLs, logs or error messages
        self._http = httpx.Client(
            base_url=BASE_URL,
            headers={"X-Api-Key": api_key},
            params={"format": "json"},
            timeout=TIMEOUT,
            transport=transport,
        )
        # Every request in one refresh shares a single deadline
        self._deadline = None if budget is None else monotonic() + budget

    def __enter__(self) -> "CongressClient":
        return self

    def __exit__(self, *exc: object) -> None:
        self._http.close()

    def get(self, path: str, **params: Any) -> dict[str, Any]:
        """Fetch one response from the API and return its decoded JSON body.

        With a budget, each request may wait only for the time the refresh has left, so a
        stalled connection ends at the deadline, although a server that keeps trickling
        bytes can still run past it.
        """
        timeout = TIMEOUT
        if self._deadline is not None:
            remaining = self._deadline - monotonic()
            if remaining <= 0:
                raise httpx.TimeoutException("Congress.gov refresh deadline expired")
            timeout = min(TIMEOUT, remaining)
        response = self._http.get(path, params=params, timeout=timeout)
        response.raise_for_status()
        return response.json()

    def paginate(self, path: str, key: str, **params: Any) -> Iterator[dict[str, Any]]:
        """Yield every item stored under key across all pages of a list endpoint."""
        offset = 0
        while True:
            page = self.get(path, limit=PAGE_SIZE, offset=offset, **params)
            items = page.get(key, [])
            yield from items
            if not items or not page.get("pagination", {}).get("next"):
                return
            offset += len(items)

    def collect(
        self, path: str, key: str, ident: Callable[[dict[str, Any]], Any], **params: Any
    ) -> list[dict[str, Any]]:
        """Return every distinct item of a list endpoint, reading it again if a pass missed some.

        Offset paging is not stable here: thousands of items share one updateDate, and an item
        updated mid-read moves, so a single pass can skip a few. Later passes fill the gaps.
        """
        expected = self.get(path, limit=1, **params)["pagination"]["count"]
        items: dict[Any, dict[str, Any]] = {}
        for _ in range(MAX_PASSES):
            for item in self.paginate(path, key, **params):
                items[ident(item)] = item
            if len(items) >= expected:
                break
        # A partial list would otherwise look like a finished sync, which is how bills went missing
        if len(items) < expected:
            print(f"{path}: read {len(items)} of {expected} items after {MAX_PASSES} passes.")
        return list(items.values())
