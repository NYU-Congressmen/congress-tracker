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
    """Describe a bill's summary and any saved plain-language explanation sections."""

    bill_id: str
    does: str
    does_not: str | None = None
    stands: str | None = None
    decides: str | None = None
    # The CRS summary is shown as what the bill does when one exists, and the AI writes the rest
    does_source: Literal["crs_summary", "ai"]
    source: str
    model: str | None = None
    cached: bool
    # Facts Congress.gov could not provide this time, such as committees or related bills
    missing: list[str] = Field(default_factory=list)
    # True when a saved model explanation is shown
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


class Cosponsor(BaseModel):
    """Describe a member who cosponsored a bill, including one who later withdrew."""

    bioguide_id: str
    name: str
    party: str | None
    state: str | None
    district: int | None
    sponsorship_date: date | None
    is_original: bool
    withdrawn_date: date | None


class BillCommittee(BaseModel):
    """Describe a committee or subcommittee holding a bill and its latest step on it."""

    system_code: str
    name: str
    chamber: str | None
    type: str | None
    parent_code: str | None
    latest_activity: str | None
    latest_activity_date: datetime | None


class RelatedBill(BaseModel):
    """Describe a bill Congress.gov links to another, and whether Pull has it stored."""

    bill_id: str
    congress: int
    type: str
    number: int
    title: str | None
    relationship: str
    identified_by: str | None
    latest_action_date: date | None
    latest_action_text: str | None
    stored: bool


class BillGraph(BaseModel):
    """Describe who decides a bill and which bills link to it, with the cache's freshness."""

    bill_id: str
    cosponsors: list[Cosponsor]
    committees: list[BillCommittee]
    related_bills: list[RelatedBill]
    cache: CacheInfo


class StanceCounts(BaseModel):
    """Count responses for each stance."""

    support: int
    oppose: int
    unsure: int


class BillResponses(BaseModel):
    """Count verified Pull users' stances on a bill, for everyone or for one state or district."""

    bill_id: str
    # The words the page shows, so readers know these are respondents rather than a poll
    label: str
    state: str | None
    district: int | None
    total: int
    counts: StanceCounts
