from logging.config import fileConfig

from sqlalchemy import create_engine, pool

from alembic import context
from app.config import settings

if context.config.config_file_name is not None:
    fileConfig(context.config.config_file_name, disable_existing_loggers=False)


def database_url() -> str:
    """Return DATABASE_URL rewritten to use the psycopg 3 driver."""
    if settings.database_url is None:
        raise RuntimeError("DATABASE_URL is not set")
    # Supabase gives postgresql:// URLs, which SQLAlchemy would otherwise send to psycopg2
    scheme, rest = settings.database_url.split("://", 1)
    if scheme in ("postgres", "postgresql"):
        return f"postgresql+psycopg://{rest}"
    return settings.database_url


def run_migrations_offline() -> None:
    """Print the migration SQL instead of running it."""
    context.configure(url=database_url(), literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations against the live database."""
    engine = create_engine(database_url(), poolclass=pool.NullPool)
    with engine.connect() as connection:
        context.configure(connection=connection)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
