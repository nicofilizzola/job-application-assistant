"""Writes backend/openapi.json so the frontend can generate types without a running server.

Run from backend/ with: uv run python -m scripts.export_openapi
"""

import json
from pathlib import Path

from app.main import app

destination = Path(__file__).resolve().parents[1] / "openapi.json"
destination.write_text(json.dumps(app.openapi(), indent=2) + "\n", encoding="utf-8")
print(f"wrote {destination}")
