from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# One .env file at the repo root serves both the backend and the frontend
ENV_FILE = Path(__file__).resolve().parents[2] / ".env"


class Settings(BaseSettings):
    """Hold configuration read from environment variables and the repo's .env file."""

    model_config = SettingsConfigDict(env_file=ENV_FILE, env_ignore_empty=True, extra="ignore")

    congress_api_key: str | None = None
    database_url: str | None = None
    firebase_project_id: str | None = None
    llm_api_key: str | None = None
    llm_base_url: str | None = None
    llm_model: str | None = None
    moderation_api_key: str | None = None
    openai_embedding_api_key: str | None = None
    # The public address share links point to
    public_site_url: str = "https://congress-pull.web.app"
    # Pull's own Bluesky account, which searches for posts carrying share links
    bluesky_handle: str | None = None
    bluesky_app_password: str | None = None
    bluesky_service: str = "https://bsky.social"


settings = Settings()
