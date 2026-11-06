from typing import Any

import httpx

from app.ai.explainer import plain_text
from app.db import connect, fetch_one

# Some bills run to hundreds of pages, so the download gets the same patience as the explainer
TEXT_TIMEOUT = 30.0

# Each Congress.gov format name and the column its link is stored in
FORMAT_COLUMNS = {"Formatted Text": "text_url", "PDF": "pdf_url", "Formatted XML": "xml_url"}

# The cached text stays only while its link is the same; a new link means the old text is stale
SAVE_VERSION_SQL = """
    INSERT INTO text_versions (bill_id, version_type, version_date, text_url, pdf_url, xml_url)
    VALUES (%(bill_id)s, %(version_type)s, %(version_date)s, %(text_url)s, %(pdf_url)s,
            %(xml_url)s)
    ON CONFLICT (bill_id, version_type) DO UPDATE SET
        version_date = EXCLUDED.version_date,
        text_url = EXCLUDED.text_url,
        pdf_url = EXCLUDED.pdf_url,
        xml_url = EXCLUDED.xml_url,
        text = CASE WHEN text_versions.text_url IS DISTINCT FROM EXCLUDED.text_url
                    THEN NULL ELSE text_versions.text END
"""


def clean_version(bill_id: str, version: dict[str, Any]) -> dict[str, Any]:
    """Turn one entry of a bill's Congress.gov text list into a row for text_versions."""
    urls = {f["type"]: f["url"] for f in version.get("formats", [])}
    return {
        "bill_id": bill_id,
        "version_type": version["type"],
        "version_date": version.get("date"),
        **{column: urls.get(name) for name, column in FORMAT_COLUMNS.items()},
    }


def load_text(bill_id: str, version_type: str) -> str | None:
    """Return one version's plain text, downloading and caching it the first time it is needed."""
    row = fetch_one(
        "SELECT text, text_url FROM text_versions WHERE bill_id = %s AND version_type = %s",
        (bill_id, version_type),
    )
    if row is None:
        raise LookupError(f"{bill_id} has no text version called {version_type!r}")
    # Already downloaded, or published without a formatted-text link
    if row["text"] is not None or row["text_url"] is None:
        return row["text"]
    page = httpx.get(row["text_url"], follow_redirects=True, timeout=TEXT_TIMEOUT)
    page.raise_for_status()
    text = plain_text(page.text)
    with connect() as conn:
        conn.execute(
            "UPDATE text_versions SET text = %s WHERE bill_id = %s AND version_type = %s",
            (text, bill_id, version_type),
        )
    return text
