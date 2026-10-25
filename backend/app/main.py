from fastapi import FastAPI

from app.routes import health

app = FastAPI(title="Congress Tracker API", version="0.1.0")

# Every route lives under /api so the Vite dev server can proxy it as one prefix
app.include_router(health.router, prefix="/api")
