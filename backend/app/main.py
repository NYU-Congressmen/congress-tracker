from fastapi import FastAPI
from starlette.routing import Route

from app.mcp import http_app as mcp_app
from app.routes import (
    account,
    bills,
    explanations,
    feed,
    graph,
    health,
    members,
    responses,
    reviews,
    sharing,
    votes,
)

app = FastAPI(title="Pull API", version="0.1.0", lifespan=mcp_app.lifespan)

# Keep browser API routes under /api and serve Streamable HTTP at the exact MCP path.
app.router.routes.append(Route("/mcp", mcp_app, methods=["GET", "POST", "DELETE"]))
app.include_router(health.router, prefix="/api")
app.include_router(members.router, prefix="/api")
app.include_router(bills.router, prefix="/api")
app.include_router(explanations.router, prefix="/api")
app.include_router(feed.router, prefix="/api")
app.include_router(reviews.router, prefix="/api")
app.include_router(account.router, prefix="/api")
app.include_router(graph.router, prefix="/api")
app.include_router(responses.router, prefix="/api")
app.include_router(votes.router, prefix="/api")
app.include_router(sharing.router, prefix="/api")
# Share links live at /s/{code}, outside /api, so the address people see stays short
app.include_router(sharing.pages)
