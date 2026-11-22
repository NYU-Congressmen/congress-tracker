import html
import re
from typing import Any

from app.config import settings

# The way Congress.gov writes each bill type, matching the frontend's labels
BILL_TYPE_LABELS = {
    "hr": "H.R.",
    "s": "S.",
    "hjres": "H.J. Res.",
    "sjres": "S.J. Res.",
    "hconres": "H.Con. Res.",
    "sconres": "S.Con. Res.",
    "hres": "H.Res.",
    "sres": "S.Res.",
}

# Link previews are fetched by robots, which would otherwise count as people who clicked.
# A missing user agent counts as a robot too.
PREVIEW_ROBOT = re.compile(
    r"bot|crawl|spider|slurp|preview|externalhit|externalagent|cardyb|embedly|whatsapp|"
    r"telegram|discord|slack|skype|vkshare|pinterest|mastodon|bluesky|curl|wget|python|"
    r"httpx|headless|go-http|^$",
    re.IGNORECASE,
)

# Long enough for a card to say what the bill does, short enough not to be cut mid-word by apps
DESCRIPTION_LENGTH = 200

# The random part of a share link, as in /s/k3Xa9QpL
CODE_PATTERN = re.compile(r"[A-Za-z0-9_-]{6,32}")


def share_url(code: str) -> str:
    """Return the public address of a share link."""
    return f"{settings.public_site_url.rstrip('/')}/s/{code}"


def bill_label(bill_type: str, number: int) -> str:
    """Return a bill's type and number as Congress.gov writes them, such as H.R. 1."""
    return f"{BILL_TYPE_LABELS.get(bill_type, bill_type.upper())} {number}"


def is_preview_robot(user_agent: str | None) -> bool:
    """Return whether a request comes from a link-preview robot rather than a person."""
    return bool(PREVIEW_ROBOT.search(user_agent or ""))


def shorten(text: str, length: int = DESCRIPTION_LENGTH) -> str:
    """Return text cut at a word boundary to fit the length, with an ellipsis when cut."""
    text = " ".join(text.split())
    if len(text) <= length:
        return text
    return text[:length].rsplit(" ", 1)[0].rstrip(",;:") + "…"


def card_description(bill: dict[str, Any], summary: str | None) -> str:
    """Return a card's description: the CRS summary when there is one, else the latest action."""
    if summary:
        return shorten(summary)
    if bill.get("latest_action_text"):
        when = bill.get("latest_action_date")
        prefix = (
            f"Latest action, {when:%b} {when.day}, {when.year}: " if when else "Latest action: "
        )
        return shorten(prefix + bill["latest_action_text"])
    return "Follow this bill on Pull and see what verified constituents think."


def render_card(code: str, bill: dict[str, Any], description: str) -> str:
    """Return the page a share link serves: a preview card for apps and a redirect for people.

    Apps read the Open Graph tags without running scripts, and people's browsers follow the
    refresh to the bill's page straight away.
    """
    path = f"/bills/{bill['congress']}/{bill['type']}/{bill['number']}"
    values = {
        "title": f"{bill_label(bill['type'], bill['number'])}: {bill['title']}",
        "description": description,
        "share_url": share_url(code),
        "bill_url": f"{settings.public_site_url.rstrip('/')}{path}",
        "path": path,
    }
    e = {key: html.escape(value, quote=True) for key, value in values.items()}
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{e["title"]} | Pull</title>
<meta name="description" content="{e["description"]}">
<link rel="canonical" href="{e["bill_url"]}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Pull">
<meta property="og:title" content="{e["title"]}">
<meta property="og:description" content="{e["description"]}">
<meta property="og:url" content="{e["share_url"]}">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="{e["title"]}">
<meta name="twitter:description" content="{e["description"]}">
<meta http-equiv="refresh" content="0; url={e["path"]}">
</head>
<body>
<p><a href="{e["path"]}">Open {e["title"]} on Pull</a></p>
</body>
</html>
"""


NOT_FOUND_PAGE = """<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Link not found | Pull</title></head>
<body><p>This share link does not exist. <a href="/">Go to Pull</a></p></body>
</html>
"""
