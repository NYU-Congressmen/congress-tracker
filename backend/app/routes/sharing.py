import secrets
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse

from app.ai.explainer import latest_summary, summary_text
from app.auth import current_uid
from app.db import connect, fetch_all
from app.models import BillType, ShareLink, SharePlatform, ShareSummary
from app.sharing import (
    CODE_PATTERN,
    NOT_FOUND_PAGE,
    card_description,
    is_preview_robot,
    render_card,
    share_url,
)
from app.sync.bills import make_bill_id

# Signed-in routes under /api
router = APIRouter(tags=["sharing"])
# The share links themselves, which Firebase Hosting forwards from /s/ to the API
pages = APIRouter(include_in_schema=False)

Uid = Annotated[str, Depends(current_uid)]

# Six random bytes make an eight-character code, about 281 trillion possibilities
CODE_BYTES = 6
CODE_ATTEMPTS = 5

LINK_COLUMNS = "code, platform, visits, last_visited_at, created_at"

# Every share page is counted, so neither browsers nor Firebase Hosting's cache may keep it
PAGE_HEADERS = {"Cache-Control": "no-store", "X-Robots-Tag": "noindex"}


def with_url(link: dict[str, Any]) -> dict[str, Any]:
    """Return a share link row with its public address added."""
    return {**link, "url": share_url(link["code"])}


def own_review_id(conn: Any, uid: str, bill_id: str) -> int:
    """Return the signed-in user's review of a bill, or refuse when they have not written one."""
    row = conn.execute(
        "SELECT review_id FROM reviews WHERE uid = %s AND bill_id = %s", (uid, bill_id)
    ).fetchone()
    if row is None:
        raise HTTPException(404, "Save your review of this bill before sharing it")
    return row["review_id"]


@router.put(
    "/bills/{congress}/{bill_type}/{number}/review/shares/{platform}", response_model=ShareLink
)
def create_share_link(
    congress: int, bill_type: BillType, number: int, platform: SharePlatform, uid: Uid
) -> dict[str, Any]:
    """Return the user's link for sharing their review on one platform, creating it once.

    Asking again for the same platform returns the same link, so its visits keep adding up.
    """
    with connect() as conn:
        review_id = own_review_id(conn, uid, make_bill_id(congress, bill_type, number))
        for _ in range(CODE_ATTEMPTS):
            created = conn.execute(
                f"""
                INSERT INTO share_links (code, review_id, platform) VALUES (%s, %s, %s)
                ON CONFLICT DO NOTHING
                RETURNING {LINK_COLUMNS}
                """,
                (secrets.token_urlsafe(CODE_BYTES), review_id, platform),
            ).fetchone()
            if created:
                return with_url(created)
            # Either this platform already has a link, or the random code was taken
            existing = conn.execute(
                f"SELECT {LINK_COLUMNS} FROM share_links WHERE review_id = %s AND platform = %s",
                (review_id, platform),
            ).fetchone()
            if existing:
                return with_url(existing)
    raise HTTPException(503, "A share link could not be created. Try again.")


@router.get("/bills/{congress}/{bill_type}/{number}/review/shares", response_model=ShareSummary)
def list_shares(congress: int, bill_type: BillType, number: int, uid: Uid) -> dict[str, Any]:
    """Return where the user shared their review, with visits, and the posts found carrying it."""
    with connect() as conn:
        review_id = own_review_id(conn, uid, make_bill_id(congress, bill_type, number))
    links = fetch_all(
        f"SELECT {LINK_COLUMNS} FROM share_links WHERE review_id = %s ORDER BY created_at, code",
        (review_id,),
    )
    posts = fetch_all(
        """
        SELECT platform, post_url, posted_at, created_at AS found_at
        FROM post_cards WHERE review_id = %s AND NOT hidden_on_pull
        ORDER BY posted_at DESC NULLS LAST, post_card_id DESC
        """,
        (review_id,),
    )
    return {"shared_to": [with_url(link) for link in links], "posted_to": posts}


@pages.get("/s/{code}", response_class=HTMLResponse)
def open_share_link(code: str, request: Request) -> HTMLResponse:
    """Serve a share link's preview card and send people on to the bill's page.

    A person's visit is counted against the link's platform. Link-preview robots read the same
    card but are not counted.
    """
    if not CODE_PATTERN.fullmatch(code):
        return HTMLResponse(NOT_FOUND_PAGE, status_code=404, headers=PAGE_HEADERS)
    counted = not is_preview_robot(request.headers.get("user-agent"))
    with connect() as conn:
        if counted:
            link = conn.execute(
                "UPDATE share_links SET visits = visits + 1, last_visited_at = now()"
                " WHERE code = %s RETURNING review_id",
                (code,),
            ).fetchone()
        else:
            link = conn.execute(
                "SELECT review_id FROM share_links WHERE code = %s", (code,)
            ).fetchone()
        bill = (
            link
            and conn.execute(
                """
            SELECT b.bill_id, b.congress, b.type, b.number, b.title, b.latest_action_date,
                   b.latest_action_text
            FROM reviews r JOIN bills b ON b.bill_id = r.bill_id
            WHERE r.review_id = %s
            """,
                (link["review_id"],),
            ).fetchone()
        )
    if not bill:
        return HTMLResponse(NOT_FOUND_PAGE, status_code=404, headers=PAGE_HEADERS)
    summary = latest_summary(bill["bill_id"])
    description = card_description(bill, summary_text(summary["text"]) if summary else None)
    return HTMLResponse(render_card(code, bill, description), headers=PAGE_HEADERS)
