from fastapi.testclient import TestClient

from app.ai.explainer import explain
from app.config import settings
from app.db import connect
from app.main import app
from tests.test_explainer import BILL, PARTS, fake_client

PROTOCOL = "2025-06-18"
HEADERS = {
    "Accept": "application/json, text/event-stream",
    "MCP-Protocol-Version": PROTOCOL,
}


def rpc(client: TestClient, method: str, params: dict) -> dict:
    """Send one MCP request over HTTP and return its protocol result."""
    payload = {"jsonrpc": "2.0", "id": 1, "method": method, "params": params}
    response = client.post("/mcp", headers=HEADERS, json=payload)
    response.raise_for_status()
    return response.json()["result"]


def test_mcp_discovers_and_calls_only_public_tools(db, monkeypatch):
    monkeypatch.setattr(settings, "llm_model", "saved-model")
    with connect() as conn:
        conn.execute(
            "INSERT INTO bills (bill_id, congress, type, number, title) "
            "VALUES ('119-s-3108', 119, 's', 3108, 'Example Act')"
        )
        conn.execute(
            "INSERT INTO members (bioguide_id, name, state, chamber, is_current) "
            "VALUES ('X000001', 'Example Member', 'NY', 'House', true)"
        )
    explain(BILL, fake_client(PARTS))

    with TestClient(app, base_url="http://localhost") as client:
        initialized = rpc(
            client,
            "initialize",
            {
                "protocolVersion": PROTOCOL,
                "capabilities": {},
                "clientInfo": {"name": "test", "version": "1"},
            },
        )
        assert initialized["serverInfo"]["name"] == "Pull"
        tools = rpc(client, "tools/list", {})["tools"]
        assert {tool["name"] for tool in tools} == {
            "search_bills",
            "list_members",
            "get_bill_explanation",
        }
        assert all(tool["annotations"]["readOnlyHint"] is True for tool in tools)

        bills = rpc(
            client, "tools/call", {"name": "search_bills", "arguments": {"query": "example"}}
        )
        assert bills["structuredContent"]["data"][0]["bill_id"] == "119-s-3108"

        members = rpc(client, "tools/call", {"name": "list_members", "arguments": {"state": "ny"}})
        assert members["structuredContent"]["data"][0]["name"] == "Example Member"

        params = {
            "name": "get_bill_explanation",
            "arguments": {"congress": 119, "bill_type": "s", "number": 3108},
        }
        explanation = rpc(client, "tools/call", params)["structuredContent"]
        assert explanation["does"] == PARTS.does
        assert explanation["from_stored"] is True
        params["arguments"]["number"] = 99999
        missing = rpc(client, "tools/call", params)
        assert missing["isError"] is True
        assert "unavailable" in missing["content"][0]["text"]


def test_mcp_rejects_an_unrecognized_browser_origin():
    with TestClient(app, base_url="http://localhost") as client:
        headers = {**HEADERS, "Origin": "https://example.org"}
        response = client.post("/mcp", headers=headers, json={})
        assert response.status_code == 403
