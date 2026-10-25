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


settings = Settings()
