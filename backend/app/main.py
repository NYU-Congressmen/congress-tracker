from fastapi import FastAPI

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
    votes,
)

app = FastAPI(title="Pull API", version="0.1.0")

# Every route lives under /api so the Vite dev server can proxy it as one prefix
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
