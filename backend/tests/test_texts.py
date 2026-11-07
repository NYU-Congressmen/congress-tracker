import httpx
import psycopg
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.sync.texts import SAVE_VERSION_SQL, clean_version, load_text
from tests.conftest import TEST_DATABASE_URL

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
    # Only the version not yet stored was downloaded
    assert downloads == ["https://example.test/eh.htm"]

    params["to"] = "Enrolled Bill"
    assert client.get("/api/bills/119/hr/1/diff", params=params).status_code == 404


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
