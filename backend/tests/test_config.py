import os
import subprocess
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]


def test_missing_env_vars_exit_with_a_readable_message():
    """Startup outside backend/ finds no .env, so both settings are absent."""
    env = {k: v for k, v in os.environ.items() if k not in ("DATABASE_URL", "BACKEND_API_KEY")}
    env["PYTHONPATH"] = str(BACKEND)

    result = subprocess.run(
        [sys.executable, "-c", "import app.config"],
        cwd=BACKEND.parent,
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 1
    assert "DATABASE_URL" in result.stderr
    assert "BACKEND_API_KEY" in result.stderr
    assert "Traceback" not in result.stderr
