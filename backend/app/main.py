from fastapi import FastAPI

from app.routes import bills, explanations, feed, health, members, reviews

app = FastAPI(title="Pull API", version="0.1.0")

# Every route lives under /api so the Vite dev server can proxy it as one prefix
app.include_router(health.router, prefix="/api")
app.include_router(members.router, prefix="/api")
app.include_router(bills.router, prefix="/api")
app.include_router(explanations.router, prefix="/api")
app.include_router(feed.router, prefix="/api")
app.include_router(reviews.router, prefix="/api")
