import time

import httpx
import pytest

from app.sync.client import CongressClient


def fake_api(request: httpx.Request) -> httpx.Response:
    """Serve two pages of bills, the second marked as the last."""
    offset = int(request.url.params["offset"])
    if offset == 0:
        body = {"bills": [{"n": 1}, {"n": 2}], "pagination": {"next": "x"}}
        return httpx.Response(200, json=body)
    return httpx.Response(200, json={"bills": [{"n": 3}], "pagination": {}})


def test_paginate_follows_every_page():
    with CongressClient("test-key", transport=httpx.MockTransport(fake_api)) as client:
        assert [b["n"] for b in client.paginate("/bill", "bills")] == [1, 2, 3]


def test_key_is_sent_as_header_not_in_url():
    seen = []

    def record(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, json={})

    with CongressClient("secret-key", transport=httpx.MockTransport(record)) as client:
        client.get("/bill")
    assert seen[0].headers["X-Api-Key"] == "secret-key"
    assert "secret-key" not in str(seen[0].url)


def test_refresh_budget_limits_each_request_and_ends_a_stalled_one():
    timeouts = []

    def stall(request):
        # A real stalled server would hit the read timeout the client passes down
        timeouts.append(request.extensions["timeout"]["read"])
        raise httpx.ReadTimeout("stalled", request=request)

    with CongressClient("test", transport=httpx.MockTransport(stall), budget=0.05) as client:
        with pytest.raises(httpx.TimeoutException):
            client.get("/bill")
    assert 0 < timeouts[0] <= 0.05


def test_refresh_budget_is_shared_across_pages():
    calls = []

    def slow_page(request):
        calls.append(request.url.params["offset"])
        time.sleep(0.12)
        return httpx.Response(200, json={"bills": [1], "pagination": {"next": "next"}})

    with CongressClient("test", transport=httpx.MockTransport(slow_page), budget=0.2) as client:
        with pytest.raises(httpx.TimeoutException):
            list(client.paginate("/bill", "bills"))
    assert calls == ["0", "1"]
