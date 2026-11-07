from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel

BillType = Literal["hr", "s", "hjres", "sjres", "hconres", "sconres", "hres", "sres"]
Status = Literal[
    "introduced",
    "committee",
    "passed_one_chamber",
    "passed_both_chambers",
    "to_president",
    "became_law",
]
Stance = Literal["support", "oppose", "unsure"]


class CacheInfo(BaseModel):
    """Describe completeness, freshness and retry timing for one cached resource."""

    complete: bool
    stale: bool
    refreshed_at: datetime | None
    refresh_failed: bool
    retry_after: datetime | None


class BillSummary(BaseModel):
    """Describe a searchable bill and the chamber milestones observed so far."""

    bill_id: str
    congress: int
    type: BillType
    number: int
    title: str
    status: Status
    passed_house: bool
    passed_senate: bool
    introduced_date: date | None
    latest_action_date: date | None
    latest_action_text: str | None


class BillPage(BaseModel):
    """Describe a page of matching bills and the total number of matches."""

    total: int
    page: int
    limit: int
    data: list[BillSummary]


class Member(BaseModel):
    """Describe a current or former member of Congress."""

    bioguide_id: str
    name: str
    party: str | None
    state: str | None
    chamber: str | None
    district: int | None
    image_url: str | None
    is_current: bool


class MemberList(BaseModel):
    """Describe the current members matching a set of filters."""

    total: int
    data: list[Member]


class BillAction(BaseModel):
    """Describe an action in the sequence supplied by Congress.gov."""

    action_date: date | None
    type: str | None
    text: str | None


class BillDetail(BillSummary):
    """Describe a bill with its cached sponsor, action history and freshness."""

    policy_area: str | None
    sponsor_id: str | None
    sponsor: Member | None
    actions: list[BillAction]
    cache: CacheInfo


class MemberDetail(Member):
    """Describe a member with current-Congress sponsored bills and their cache freshness."""

    sponsored_bills: list[BillSummary]
    cache: CacheInfo


class TextVersion(BaseModel):
    """Describe one published version of a bill's text and where to read it."""

    version_type: str
    version_date: datetime | None
    text_url: str | None
    pdf_url: str | None
    downloaded: bool


class BillDiff(BaseModel):
    """Describe the line-by-line changes between two versions of a bill's text."""

    from_version: str
    to_version: str
    changes: list[str]


class ReviewIn(BaseModel):
    """Describe what a user writes when reviewing a bill."""

    stance: Stance
    story: str | None = None
    action_taken: str | None = None
    consent_to_share: bool = False


class Review(ReviewIn):
    """Describe a saved review of one bill by the signed-in user."""

    bill_id: str
    created_at: datetime
    updated_at: datetime
