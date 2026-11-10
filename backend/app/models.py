from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

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

# Far beyond any real post, while keeping huge pastes out of the database and the AI brief
MAX_REVIEW_TEXT = 20_000


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


class Issue(BaseModel):
    """Describe an issue a person can choose for their feed."""

    issue_id: int
    name: str


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
    office_phone: str | None
    office_address: str | None
    website_url: str | None


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


class BillExplanation(BaseModel):
    """A bill explained in four plain-language parts, each labeled with where it came from."""

    bill_id: str
    does: str
    does_not: str
    stands: str
    decides: str
    # The CRS summary is shown as what the bill does when one exists, and the AI writes the rest
    does_source: Literal["crs_summary", "ai"]
    source: str
    model: str
    cached: bool
    # Facts Congress.gov could not provide this time, such as committees or related bills
    missing: list[str]
    # True when Congress.gov or the model failed and the bill's last saved explanation is shown
    from_stored: bool


class ReviewIn(BaseModel):
    """Describe what a user writes when reviewing a bill."""

    stance: Stance
    story: str | None = Field(default=None, max_length=MAX_REVIEW_TEXT)
    action_taken: str | None = Field(default=None, max_length=MAX_REVIEW_TEXT)
    consent_to_share: bool = False

    @field_validator("story", "action_taken")
    @classmethod
    def clean_text(cls, value: str | None) -> str | None:
        """Return the text as written, or None when it is blank, and refuse a null character."""
        # PostgreSQL text cannot hold a null character, so it would otherwise fail on saving
        if value is not None and "\x00" in value:
            raise ValueError("Text cannot contain a null character")
        return value if value and value.strip() else None


class Review(ReviewIn):
    """Describe a saved review of one bill by the signed-in user."""

    bill_id: str
    created_at: datetime
    updated_at: datetime
