from uuid import uuid4

import psycopg
from fastapi.testclient import TestClient

from app.auth import current_uid
from app.main import app
from tests.conftest import TEST_DATABASE_URL

URL = "/api/bills/119/hr/1/calls"


def test_call_retries_and_account_isolation(db, monkeypatch):
    with psycopg.connect(TEST_DATABASE_URL) as conn:
        conn.execute(
            "INSERT INTO bills (bill_id, congress, type, number, title) "
            "VALUES ('119-hr-1', 119, 'hr', 1, 'Example Act')"
        )
        conn.execute(
            "INSERT INTO members (bioguide_id, name) "
            "VALUES ('X000001', 'First Example'), ('X000002', 'Second Example')"
        )
        conn.execute(
            "INSERT INTO users (uid, phone) "
            "VALUES ('caller-1', '+15550000101'), ('caller-2', '+15550000102')"
        )
    client = TestClient(app)
    path = f"{URL}/{uuid4()}"
    office = {"bioguide_id": "X000001"}
    assert client.get(URL).status_code == 401
    assert client.put(path, json=office).status_code == 401

    monkeypatch.setitem(app.dependency_overrides, current_uid, lambda: "caller-1")
    assert client.put(path, json={"bioguide_id": "unknown"}).status_code == 404
    assert client.put(path, json={**office, "note": "a" * 2_001}).status_code == 422
    first = client.put(path, json={**office, "note": "  Asked about the bill.  "})
    assert first.status_code == 200
    assert first.json()["member_name"] == "First Example"
    assert first.json()["note"] == "Asked about the bill."
    assert client.put(path, json=office).json() == first.json()
    assert client.put(path, json={**office, "note": "Changed on retry"}).json() == first.json()
    assert client.put(path, json={"bioguide_id": "X000002"}).status_code == 409
    assert client.get(URL).json() == [first.json()]

    later = client.put(f"{URL}/{uuid4()}", json=office)
    assert later.status_code == 200
    assert later.json()["note"] is None
    assert [entry["action_id"] for entry in client.get(URL).json()] == [
        later.json()["action_id"],
        first.json()["action_id"],
    ]
    monkeypatch.setitem(app.dependency_overrides, current_uid, lambda: "caller-2")
    assert client.get(URL).json() == []
