import shutil
import subprocess
import sys
from pathlib import Path

from alembic.config import Config
from alembic.script import ScriptDirectory


def test_generated_migration_passes_project_checks(tmp_path):
    """Generate a migration and verify that it passes the project's lint and formatting checks."""
    backend = Path(__file__).resolve().parents[1]
    migrations = tmp_path / "alembic"
    migrations.mkdir()
    (migrations / "versions").mkdir()
    shutil.copy(backend / "alembic" / "script.py.mako", migrations)
    config = Config(str(backend / "alembic.ini"))
    config.set_main_option("script_location", str(migrations))
    script = ScriptDirectory.from_config(config).generate_revision("123456abcdef", "Create table")

    for arguments in (["check"], ["format", "--check"]):
        result = subprocess.run(
            [
                sys.executable,
                "-m",
                "ruff",
                *arguments,
                "--config",
                str(backend / "pyproject.toml"),
                script.path,
            ],
            capture_output=True,
            text=True,
        )
        assert result.returncode == 0, result.stdout + result.stderr
