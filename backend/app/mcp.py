"""Expose Pull's public legislative records as read-only MCP tools."""

from typing import Annotated, Literal

from fastapi import HTTPException
from fastmcp import FastMCP
from fastmcp.exceptions import ToolError
from pydantic import Field

from app.models import BillExplanation, BillPage, BillType, MemberList, Status
from app.routes.bills import search_bills as search_public_bills
from app.routes.explanations import get_explanation
from app.routes.members import list_members as list_public_members

server = FastMCP(
    "Pull",
    instructions="Find public U.S. bills, current members of Congress and saved bill explanations.",
    mask_error_details=True,
)
READ_ONLY = {"readOnlyHint": True, "destructiveHint": False, "idempotentHint": True}


@server.tool(annotations=READ_ONLY)
def search_bills(
    query: Annotated[str, Field(min_length=1, max_length=120)],
    status: Status | None = None,
    page: Annotated[int, Field(ge=1, le=1000)] = 1,
    limit: Annotated[int, Field(ge=1, le=25)] = 10,
) -> BillPage:
    """Search stored bill titles by keyword and optional status, newest action first."""
    query = query.strip()
    if not query:
        raise ToolError("Enter a bill title keyword.")
    results = search_public_bills(q=query, status=status, page=page, limit=limit)
    return BillPage.model_validate(results)


@server.tool(annotations=READ_ONLY)
def list_members(
    state: Annotated[str, Field(pattern=r"^[A-Za-z]{2}$", description="Two-letter postal code")],
    chamber: Literal["House", "Senate"] | None = None,
) -> MemberList:
    """List current members and stored office contact information for a state or territory."""
    return MemberList.model_validate(list_public_members(state=state, chamber=chamber))


@server.tool(annotations=READ_ONLY)
def get_bill_explanation(
    congress: Annotated[int, Field(ge=1, le=999)],
    bill_type: BillType,
    number: Annotated[int, Field(ge=1, le=999999)],
) -> BillExplanation:
    """Return a saved bill explanation or its official Congressional Research Service summary."""
    try:
        return get_explanation(congress, bill_type, number)
    except HTTPException as error:
        if error.status_code == 404:
            raise ToolError("A saved explanation or official summary is unavailable.") from None
        raise


# Stateless requests let each Cloud Run instance handle a call without shared session state.
http_app = server.http_app(
    path="/mcp",
    stateless_http=True,
    json_response=True,
    host_origin_protection="auto",
    allowed_origins=["https://congress-pull.web.app", "https://congress-pull.firebaseapp.com"],
)
