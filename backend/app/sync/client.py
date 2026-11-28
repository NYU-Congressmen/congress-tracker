import asyncio
from collections.abc import Callable, Iterator
from contextlib import contextmanager
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
        transport: httpx.BaseTransport | httpx.AsyncBaseTransport | None = None,
        budget: float | None = None,
        *,
        retry_read_timeouts: bool = False,
    ):
        # The key goes in a header so it never appears in URLs, logs or error messages
        self._http_options = {
            "base_url": BASE_URL,
            "headers": {"X-Api-Key": api_key},
            "params": {"format": "json"},
            "transport": transport,
        }
        self._http = httpx.Client(**self._http_options) if budget is None else None
        # Every request in one refresh shares a single deadline
        self._deadline = None if budget is None else monotonic() + budget
        self._read_attempts = 3 if retry_read_timeouts else 1

    def __enter__(self) -> "CongressClient":
        return self

    def __exit__(self, *exc: object) -> None:
        if self._http is not None:
            self._http.close()

    @contextmanager
    def _retry_read(self, path: str, attempt: int) -> Iterator[None]:
        try:
            yield
        except httpx.ReadTimeout:
            if attempt == self._read_attempts:
                raise
            print(
                f"Congress.gov read timed out on {path} (attempt {attempt}). Retrying.",
                flush=True,
            )

    def get(self, path: str, **params: Any) -> dict[str, Any]:
        """Return the decoded JSON response for one API request."""
        if self._http is not None:
            for attempt in range(1, self._read_attempts + 1):
                with self._retry_read(path, attempt):
                    response = self._http.get(path, params=params, timeout=TIMEOUT)
                    response.raise_for_status()
                    return response.json()
        return asyncio.run(self._get_parallel(((path, None, params),)))[0]

    def get_parallel(self, *requests: tuple[str, str | None]) -> list[Any]:
        """Return responses in request order, collecting all pages when a list key is given."""
        if self._deadline is None:
            return [
                self.get(path) if key is None else list(self.paginate(path, key))
                for path, key in requests
            ]
        return asyncio.run(self._get_parallel(tuple((path, key, {}) for path, key in requests)))

    async def _get_parallel(
        self, requests: tuple[tuple[str, str | None, dict[str, Any]], ...]
    ) -> list[Any]:
        assert self._deadline is not None
        remaining = self._deadline - monotonic()
        if remaining <= 0:
            raise httpx.TimeoutException("Congress.gov refresh deadline expired")
        try:
            async with asyncio.timeout(remaining):
                async with httpx.AsyncClient(
                    **self._http_options, timeout=min(TIMEOUT, remaining)
                ) as client:
                    tasks = [
                        asyncio.create_task(self._read_async(client, path, key, params))
                        for path, key, params in requests
                    ]
                    try:
                        # A missing bill takes precedence over errors in its dependent endpoints.
                        return [await task for task in tasks]
                    finally:
                        for task in tasks:
                            if not task.done():
                                task.cancel()
                        await asyncio.gather(*tasks, return_exceptions=True)
        except TimeoutError as error:
            raise httpx.TimeoutException("Congress.gov refresh deadline expired") from error

    async def _read_async(
        self, client: httpx.AsyncClient, path: str, key: str | None, params: dict[str, Any]
    ) -> Any:
        offset = 0
        items = []
        while True:
            query = params if key is None else {**params, "limit": PAGE_SIZE, "offset": offset}
            for attempt in range(1, self._read_attempts + 1):
                with self._retry_read(path, attempt):
                    response = await client.get(path, params=query)
                    response.raise_for_status()
                    page = response.json()
                    break
            if key is None:
                return page
            batch = page.get(key, [])
            items.extend(batch)
            if not batch or not page.get("pagination", {}).get("next"):
                return items
            offset += len(batch)

    def paginate(self, path: str, key: str, **params: Any) -> Iterator[dict[str, Any]]:
        """Yield every item stored under key across all pages of a list endpoint."""
        if self._deadline is not None:
            yield from asyncio.run(self._get_parallel(((path, key, params),)))[0]
            return
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
