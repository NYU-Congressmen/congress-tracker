from datetime import date, datetime
from typing import Annotated, Literal

from pydantic import BaseModel, Field, StringConstraints, field_validator

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


class DistrictAddress(BaseModel):
    """Describe a street address submitted for district lookup."""

    address: Annotated[str, StringConstraints(strip_whitespace=True, min_length=5, max_length=300)]


class AccountDistrict(BaseModel):
    """Describe a Census district by state and district number."""

    state: str
    district: int | None


class DistrictQuery(BaseModel):
    """Describe what a reader typed into the district search."""

    query: Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=300)]


class MemberBrief(BaseModel):
    """Describe a current member listed beside a district search result."""

    bioguide_id: str
    name: str
    party: str | None
    state: str
    image_url: str | None


class DistrictCandidate(AccountDistrict):
    """Describe one district a search matched and its House member, if known."""

    representative: MemberBrief | None


class DistrictSearchResult(BaseModel):
    """Describe the districts a search matched, how they were matched and the state's senators.

    A source of address means the Census verified the match, so a single district can be saved
    to the account. Zip and state results are candidates the reader chooses among.
    """

    source: Literal["address", "zip", "state"]
    districts: list[DistrictCandidate]
    senators: list[MemberBrief]


class ProfileDistrict(AccountDistrict):
    """Describe the location shown in the account's profile."""

    state: Annotated[str, StringConstraints(pattern=r"^[A-Z]{2}$")]
    district: Annotated[int | None, Field(ge=1, le=99)]
    method: Literal["address", "map", "number", "search"]


class ProfileSocial(BaseModel):
    """Describe a saved social handle."""

    platform: Annotated[str, StringConstraints(min_length=1, max_length=32)]
    handle: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=512)]


class ProfilePreferences(BaseModel):
    """Describe editable preferences for a verified account."""

    username: Annotated[
        str, StringConstraints(strip_whitespace=True, pattern=r"^[a-zA-Z0-9_.-]{3,80}$")
    ] = "Profile"
    district: ProfileDistrict | None = None
    topics: Annotated[list[Annotated[int, Field(gt=0)]], Field(max_length=100)] = Field(
        default_factory=list
    )
    socials: Annotated[list[ProfileSocial], Field(max_length=20)] = Field(default_factory=list)


class AccountProfile(ProfilePreferences):
    """Describe a verified account's profile and whether preferences have been saved."""

    saved: bool
    created_at: datetime
    updated_at: datetime


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


class BillText(BaseModel):
    """Describe the full text of one published bill version."""

    version_type: str
    text: str


class BillDiff(BaseModel):
    """Describe the line-by-line changes and any saved summary for a pair of bill versions."""

    from_version: str
    to_version: str
    changes: list[str]
    summary: str | None = None


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
    # Include the review in the Constituent Signal brief for the author's office
    consent_to_share: bool = False
    # List the review on the bill page with the author's state and district
    share_publicly: bool = False

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
    moderation_status: Literal["pending", "flagged", "held", "cleared"]
    created_at: datetime
    updated_at: datetime
    # A hidden review stays the author's own, out of shared lists and response counts
    hidden: bool = False


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
    # True when sample accounts are among the counted respondents
    includes_sample: bool = False


class ReviewVisibility(BaseModel):
    """Describe whether the author wants their review hidden."""

    hidden: bool


class PublicReview(BaseModel):
    """Describe a review its author agreed to share, with the state and district they saved."""

    review_id: int
    bill_id: str
    stance: Stance
    story: str | None
    action_taken: str | None
    state: str | None
    district: int | None
    created_at: datetime
    updated_at: datetime
    # Platforms where a live post carrying one of the review's share links was found
    posted_to: list[str] = Field(default_factory=list)
    mine: bool = False
    is_sample: bool = False


class ReviewPage(BaseModel):
    """Describe a page of shared reviews of a bill and how many there are."""

    total: int
    page: int
    limit: int
    data: list[PublicReview]


ReportReason = Literal["spam", "harassment", "misinformation", "personal_info", "other"]

# Room to explain a report without letting it become a second review
MAX_REPORT_DETAILS = 1_000


class ReportIn(BaseModel):
    """Describe why someone reports a shared review."""

    reason: ReportReason
    details: str | None = Field(default=None, max_length=MAX_REPORT_DETAILS)

    @field_validator("details")
    @classmethod
    def clean_details(cls, value: str | None) -> str | None:
        """Return the details as written, or None when blank, and refuse a null character."""
        return ReviewIn.clean_text(value)


class VotePosition(BaseModel):
    """Describe how one House member voted, exactly as the Clerk recorded it."""

    bioguide_id: str
    name: str | None
    party: str | None
    state: str | None
    district: int | None
    position: str


class HouseVote(BaseModel):
    """Describe a House roll-call vote on a bill, its totals and members' positions."""

    congress: int
    session: int
    roll_number: int
    vote_date: datetime | None
    question: str | None
    result: str | None
    vote_type: str | None
    source_url: str | None
    # False until the sync fetches the positions; totals and positions are empty until then
    positions_complete: bool
    # Every member's position counted by how it was recorded, such as {"Yea": 220, "Nay": 210}
    totals: dict[str, int]
    positions: list[VotePosition]


SharePlatform = Literal[
    "bluesky", "x", "mastodon", "threads", "instagram", "tiktok", "facebook", "linkedin", "other"
]


class ShareLink(BaseModel):
    """Describe the signed-in user's share link for one platform and how many people it brought."""

    platform: SharePlatform
    code: str
    url: str
    # People who opened the link, leaving out link-preview robots
    visits: int
    last_visited_at: datetime | None
    created_at: datetime


class PostedTo(BaseModel):
    """Describe a live post found carrying one of the user's share links."""

    platform: str
    post_url: str
    posted_at: datetime | None
    found_at: datetime


class ShareSummary(BaseModel):
    """Describe where the user shared their review and where posts with its links were found."""

    shared_to: list[ShareLink]
    posted_to: list[PostedTo]


class CallIn(BaseModel):
    """Describe the congressional office a person called."""

    bioguide_id: str = Field(min_length=1, max_length=32)
    note: Annotated[str, StringConstraints(strip_whitespace=True, max_length=2_000)] | None = None


class CallNoteIn(BaseModel):
    """Describe the replacement note for a saved call."""

    note: Annotated[str, StringConstraints(strip_whitespace=True, max_length=2_000)] | None


class CallEntry(CallIn):
    """Describe a call recorded by the signed-in user."""

    action_id: int
    member_name: str
    created_at: datetime
