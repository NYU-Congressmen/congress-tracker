from collections.abc import Iterator
from typing import Any

import httpx

BASE_URL = "https://api.congress.gov/v3"

# The API returns 20 results per page by default and allows at most 250
PAGE_SIZE = 250


class CongressClient:
    """Wrap the Congress.gov v3 API with authentication, JSON output and paging handled."""

    def __init__(self, api_key: str, transport: httpx.BaseTransport | None = None):
        # The key goes in a header so it never appears in URLs, logs or error messages
        self._http = httpx.Client(
            base_url=BASE_URL,
            headers={"X-Api-Key": api_key},
            params={"format": "json"},
            timeout=30.0,
            transport=transport,
        )

    def __enter__(self) -> "CongressClient":
        return self

    def __exit__(self, *exc: object) -> None:
        self._http.close()

    def get(self, path: str, **params: Any) -> dict[str, Any]:
        """Fetch one response from the API and return its decoded JSON body."""
        response = self._http.get(path, params=params)
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
