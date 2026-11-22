import httpx
import psycopg
import pytest
from fastapi.testclient import TestClient
from openai import OpenAIError

from app.ai.diff_summary import DiffSummary, main, summarize_diff
from app.auth import current_uid
from app.config import settings
from app.main import app
from app.sync.texts import SAVE_VERSION_SQL, clean_version, compare_versions, load_text
from tests.conftest import TEST_DATABASE_URL
from tests.test_ai_service import FakeModel

# H.R. 1's Public Law version, which has no XML link, trimmed from a real /text response
PUBLIC_LAW = {
    "type": "Public Law",
    "date": "2025-07-05T03:59:59Z",
    "formats": [
        {
            "type": "Formatted Text",
            "url": "https://www.congress.gov/119/plaws/publ21/PLAW-119publ21.htm",
        },
        {"type": "PDF", "url": "https://www.congress.gov/119/plaws/publ21/PLAW-119publ21.pdf"},
        {"type": "United States Legislative Markup", "url": "https://www.congress.gov/x_uslm.xml"},
    ],
}


def test_clean_version_keeps_each_link_and_tolerates_missing_ones():
    row = clean_version("119-hr-1", PUBLIC_LAW)
    assert row["version_type"] == "Public Law"
    assert row["text_url"].endswith(".htm")
    assert row["pdf_url"].endswith(".pdf")
    # This version has no Formatted XML
    assert row["xml_url"] is None


def test_clean_version_without_a_date():
    row = clean_version("119-hr-1", {"type": "Enrolled Bill", "date": None, "formats": []})
    assert row["version_date"] is None
    assert row["text_url"] is None


def test_load_text_downloads_once_then_reads_the_cache(db, monkeypatch):
    with psycopg.connect(TEST_DATABASE_URL) as conn:
        conn.execute(
            "INSERT INTO bills (bill_id, congress, type, number, title) "
            "VALUES ('119-hr-1', 119, 'hr', 1, 'Example Act')"
        )
        conn.execute(
            "INSERT INTO text_versions (bill_id, version_type, text_url) "
            "VALUES ('119-hr-1', 'Introduced in House', 'https://example.test/ih.htm')"
        )
    downloads = []

    def fake_get(url, **kwargs):
        downloads.append(url)
        page = "<html><pre>SEC. 1. Short title.</pre></html>"
        return httpx.Response(200, text=page, request=httpx.Request("GET", url))

    monkeypatch.setattr("app.sync.texts.httpx.get", fake_get)
    assert load_text("119-hr-1", "Introduced in House") == "SEC. 1. Short title."
    assert load_text("119-hr-1", "Introduced in House") == "SEC. 1. Short title."
    # The second call came from Postgres
    assert downloads == ["https://example.test/ih.htm"]

    with pytest.raises(LookupError):
        load_text("119-hr-1", "Enrolled Bill")


def test_diff_downloads_only_the_missing_version_and_shows_the_changes(db, monkeypatch):
    with psycopg.connect(TEST_DATABASE_URL) as conn:
        conn.execute(
            "INSERT INTO bills (bill_id, congress, type, number, title) "
            "VALUES ('119-hr-1', 119, 'hr', 1, 'Example Act')"
        )
        # The introduced text is already stored; the engrossed one has only its link
        conn.execute(
            "INSERT INTO text_versions (bill_id, version_type, version_date, text) "
            "VALUES ('119-hr-1', 'Introduced in House', '2025-01-03', 'SEC. 1. Tax rate is 20%.')"
        )
        conn.execute(
            "INSERT INTO text_versions (bill_id, version_type, version_date, text_url) "
            "VALUES ('119-hr-1', 'Engrossed in House', '2025-05-22', 'https://example.test/eh.htm')"
        )
    downloads = []

    def fake_get(url, **kwargs):
        downloads.append(url)
        page = "<pre>SEC. 1. Tax rate is 25%.</pre>"
        return httpx.Response(200, text=page, request=httpx.Request("GET", url))

    monkeypatch.setattr("app.sync.texts.httpx.get", fake_get)
    client = TestClient(app)

    versions = client.get("/api/bills/119/hr/1/texts").json()
    assert [v["version_type"] for v in versions] == ["Introduced in House", "Engrossed in House"]
    assert [v["downloaded"] for v in versions] == [True, False]

    params = {"from": "Introduced in House", "to": "Engrossed in House"}
    body = client.get("/api/bills/119/hr/1/diff", params=params).json()
    assert "-SEC. 1. Tax rate is 20%." in body["changes"]
    assert "+SEC. 1. Tax rate is 25%." in body["changes"]
    assert body["summary"] is None
    # Only the version not yet stored was downloaded
    assert downloads == ["https://example.test/eh.htm"]

    params["to"] = "Enrolled Bill"
    assert client.get("/api/bills/119/hr/1/diff", params=params).status_code == 404


def test_public_diff_reads_only_the_saved_summary_for_the_current_pair(db, monkeypatch, capsys):
    bill_id = "119-hr-1"
    old, new = "Introduced in House", "Engrossed in House"
    summary = "The engrossed version raises the tax rate from 20 percent to 25 percent."
    with psycopg.connect(TEST_DATABASE_URL) as conn:
        conn.execute(
            "INSERT INTO bills (bill_id, congress, type, number, title) "
            "VALUES (%s, 119, 'hr', 1, 'Example Act')",
            (bill_id,),
        )
        conn.cursor().executemany(
            "INSERT INTO text_versions (bill_id, version_type, text) VALUES (%s, %s, %s)",
            [(bill_id, old, "Tax rate is 20%."), (bill_id, new, "Tax rate is 25%.")],
        )

    model = FakeModel(DiffSummary(summary=summary))
    monkeypatch.setattr(settings, "llm_model", "test-model")
    monkeypatch.setattr("app.ai.service.llm_client", lambda: model)
    assert main(["119", "hr", "1", old, new]) == 0
    assert summary in capsys.readouterr().out
    assert summarize_diff(bill_id, compare_versions(bill_id, old, new), model).cached

    monkeypatch.setattr(settings, "llm_model", None)
    client = TestClient(app)
    path = "/api/bills/119/hr/1/diff"
    assert client.get(path, params={"from": old, "to": new}).json()["summary"] == summary
    assert client.get(path, params={"from": new, "to": old}).json()["summary"] is None

    with psycopg.connect(TEST_DATABASE_URL) as conn:
        conn.execute(
            "UPDATE text_versions SET text = %s WHERE bill_id = %s AND version_type = %s",
            ("Tax rate is 30%.", bill_id, new),
        )
    changed = client.get(path, params={"from": old, "to": new}).json()
    assert changed["summary"] is None
    assert "+Tax rate is 30%." in changed["changes"]
    assert model.calls == 1


@pytest.mark.parametrize("model_error", [None, OpenAIError("Provider unavailable")])
def test_compare_generates_a_missing_summary_and_returns_the_diff(db, monkeypatch, model_error):
    bill_id = "119-hr-1"
    old, new = "Introduced in House", "Engrossed in House"
    summary = "The engrossed version raises the tax rate from 20 percent to 25 percent."
    with psycopg.connect(TEST_DATABASE_URL) as conn:
        conn.execute(
            "INSERT INTO bills (bill_id, congress, type, number, title) "
            "VALUES (%s, 119, 'hr', 1, 'Example Act')",
            (bill_id,),
        )
        conn.cursor().executemany(
            "INSERT INTO text_versions (bill_id, version_type, text) VALUES (%s, %s, %s)",
            [(bill_id, old, "Tax rate is 20%."), (bill_id, new, "Tax rate is 25%.")],
        )

    model = FakeModel(DiffSummary(summary=summary), error=model_error)
    monkeypatch.setattr(settings, "llm_model", "test-model")
    monkeypatch.setattr(settings, "llm_api_key", "test-key")
    monkeypatch.setattr("app.ai.service.llm_client", lambda: model)
    client = TestClient(app)
    path = "/api/bills/119/hr/1/diff"
    params = {"from": old, "to": new}

    assert client.get(path, params=params).json()["summary"] is None
    assert client.post(path, params=params).status_code == 401
    assert model.calls == 0

    monkeypatch.setitem(app.dependency_overrides, current_uid, lambda: "verified-reader")
    response = client.post(path, params=params)
    expected = summary if model_error is None else None
    assert response.status_code == 200
    assert response.json()["summary"] == expected
    assert "+Tax rate is 25%." in response.json()["changes"]
    assert client.get(path, params=params).json()["summary"] == expected
    if expected is not None:
        assert client.post(path, params=params).json()["summary"] == expected
    assert model.calls == 1


def test_readers_cause_new_summaries_only_within_daily_limits(db, monkeypatch):
    bill_id = "119-hr-1"
    versions = ["Introduced in House", "Engrossed in House", "Enrolled Bill"]
    with psycopg.connect(TEST_DATABASE_URL) as conn:
        conn.execute(
            "INSERT INTO bills (bill_id, congress, type, number, title) "
            "VALUES (%s, 119, 'hr', 1, 'Example Act')",
            (bill_id,),
        )
        conn.cursor().executemany(
            "INSERT INTO text_versions (bill_id, version_type, text) VALUES (%s, %s, %s)",
            [
                (bill_id, version, f"Tax rate is {rate}%.")
                for version, rate in zip(versions, [20, 25, 30], strict=True)
            ],
        )

    model = FakeModel(DiffSummary(summary="The rate changes."))
    monkeypatch.setattr(settings, "llm_model", "test-model")
    monkeypatch.setattr(settings, "llm_api_key", "test-key")
    monkeypatch.setattr("app.ai.service.llm_client", lambda: model)
    monkeypatch.setattr("app.ai.diff_summary.READER_DAILY_LIMIT", 1)
    monkeypatch.setattr("app.ai.diff_summary.TOTAL_DAILY_LIMIT", 2)
    client = TestClient(app)

    def compare(reader: str, old: str, new: str) -> str | None:
        monkeypatch.setitem(app.dependency_overrides, current_uid, lambda: reader)
        response = client.post("/api/bills/119/hr/1/diff", params={"from": old, "to": new})
        assert response.status_code == 200
        assert response.json()["changes"]
        return response.json()["summary"]

    assert compare("reader-a", versions[0], versions[1]) == "The rate changes."
    # Reader A's limit is spent, but the comparison itself still comes back
    assert compare("reader-a", versions[1], versions[2]) is None
    assert compare("reader-b", versions[1], versions[2]) == "The rate changes."
    # Both reader calls today fill the shared limit
    assert compare("reader-c", versions[0], versions[2]) is None
    # A saved summary is still served past the limit
    assert compare("reader-c", versions[0], versions[1]) == "The rate changes."
    assert model.calls == 2

    with psycopg.connect(TEST_DATABASE_URL) as conn:
        readers = conn.execute("SELECT uid FROM ai_calls ORDER BY call_id").fetchall()
    assert readers == [("reader-a",), ("reader-b",)]


def test_a_new_link_clears_the_cached_text(db):
    with psycopg.connect(TEST_DATABASE_URL) as conn:
        conn.execute(
            "INSERT INTO bills (bill_id, congress, type, number, title) "
            "VALUES ('119-hr-1', 119, 'hr', 1, 'Example Act')"
        )
        conn.execute(
            "INSERT INTO text_versions (bill_id, version_type, text_url, text) "
            "VALUES ('119-hr-1', 'Engrossed in House', 'https://example.test/old.htm', 'old')"
        )
        version = {
            "type": "Engrossed in House",
            "formats": [{"type": "Formatted Text", "url": "https://example.test/new.htm"}],
        }
        conn.execute(SAVE_VERSION_SQL, clean_version("119-hr-1", version))
        text = conn.execute("SELECT text FROM text_versions").fetchone()[0]
    # The text is downloaded again from the new link the next time it is needed
    assert text is None
