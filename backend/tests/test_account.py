import httpx
import psycopg
import pytest
from fastapi.testclient import TestClient
from firebase_admin import auth

from app.config import settings
from app.main import app
from tests.conftest import TEST_DATABASE_URL

client = TestClient(app)


@pytest.fixture
def verify_token(monkeypatch):
    """Return a token verifier that recognizes one phone session and one other session."""
    monkeypatch.setattr(settings, "firebase_project_id", "test-pull")

    def verify(token, *, app):
        assert app.project_id == "test-pull"
        if token == "test-phone-session":
            return {
                "uid": "verified-user",
                "phone_number": "+16505550101",
                "firebase": {"sign_in_provider": "phone"},
            }
        if token == "test-other-session":
            return {"uid": "other-user", "firebase": {"sign_in_provider": "password"}}
        raise auth.InvalidIdTokenError("Unrecognized test token")

    monkeypatch.setattr(auth, "verify_id_token", verify)
    return verify


def test_account_requires_a_verified_phone(verify_token):
    assert client.put("/api/account").status_code == 401
    invalid = client.put("/api/account", headers={"Authorization": "Bearer invalid"})
    assert invalid.status_code == 401
    assert (
        client.put(
            "/api/account", headers={"Authorization": "Bearer test-other-session"}
        ).status_code
        == 403
    )


def test_verified_account_can_save_its_review(db, verify_token):
    headers = {"Authorization": "Bearer test-phone-session"}
    with psycopg.connect(TEST_DATABASE_URL) as conn:
        conn.execute(
            "INSERT INTO bills (bill_id, congress, type, number, title) "
            "VALUES ('119-s-3108', 119, 's', 3108, 'Example Act')"
        )

    for _ in range(2):
        assert client.put("/api/account", headers=headers).status_code == 204

    path = "/api/bills/119/s/3108/review"
    response = client.put(
        path, json={"stance": "support", "consent_to_share": False}, headers=headers
    )
    assert response.status_code == 200
    assert client.get(path, headers=headers).json()["stance"] == "support"
    assert client.get(path).status_code == 401

    with psycopg.connect(TEST_DATABASE_URL) as conn:
        rows = conn.execute("SELECT uid, phone FROM users").fetchall()
    assert rows == [("verified-user", "+16505550101")]


def test_guest_district_lookup_returns_the_district_without_an_account(monkeypatch):
    def census_get(url, *, params, timeout):
        assert params["address"] == "100 Example Street, Example City"
        return httpx.Response(
            200,
            json={
                "result": {
                    "addressMatches": [
                        {
                            "addressComponents": {"state": "NY"},
                            "geographies": {"119th Congressional Districts": [{"GEOID": "3612"}]},
                        }
                    ]
                }
            },
            request=httpx.Request("GET", url),
        )

    monkeypatch.setattr("app.geocoding.httpx.get", census_get)
    address = {"address": "100 Example Street, Example City"}
    result = client.post("/api/district-lookup", json=address)
    assert result.status_code == 200
    assert result.json() == {"state": "NY", "district": 12}
    assert client.put("/api/account/district", json=address).status_code == 401


@pytest.mark.parametrize(
    ("state", "geoid", "district"), [("NY", "3612", 12), ("WY", "5600", None), ("DC", "1198", None)]
)
def test_verified_account_saves_the_119th_congress_district(
    db, verify_token, monkeypatch, state, geoid, district
):
    path = "/api/account/district"
    headers = {"Authorization": "Bearer test-phone-session"}
    address = {"address": "100 Example Street, Example City"}
    matches = []

    def census_get(url, *, params, timeout):
        assert params["vintage"] == "ACS2025_Current"
        assert params["address"] == address["address"]
        return httpx.Response(
            200, json={"result": {"addressMatches": matches}}, request=httpx.Request("GET", url)
        )

    monkeypatch.setattr("app.geocoding.httpx.get", census_get)
    assert client.put(path, json=address).status_code == 401
    assert client.put(path, json=address, headers=headers).status_code == 403
    assert client.put("/api/account", headers=headers).status_code == 204
    assert client.get(path, headers=headers).json() is None

    matches.append(
        {
            "addressComponents": {"state": state},
            "geographies": {"119th Congressional Districts": [{"GEOID": geoid}]},
        }
    )
    expected = {"state": state, "district": district}
    assert client.put(path, json=address, headers=headers).json() == expected
    assert client.get(path, headers=headers).json() == expected

    matches.clear()
    assert client.put(path, json=address, headers=headers).status_code == 422
    assert client.get(path, headers=headers).json() == expected
