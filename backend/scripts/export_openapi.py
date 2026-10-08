"""
Write the API contract to backend/openapi.json (frontend ticket 03).

    uv run python scripts/export_openapi.py

No server or database is needed. Commit the file: the frontend generates its
types from it (`pnpm api:generate`), so a changed endpoint shows up as a diff.
"""
import json
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

from app.main import app  # noqa: E402  (needs the path set above)

OUTPUT = BACKEND_DIR / "openapi.json"


def main() -> None:
    spec = json.dumps(app.openapi(), indent=2, ensure_ascii=False) + "\n"
    OUTPUT.write_text(spec, encoding="utf-8", newline="\n")
    print(f"Wrote {OUTPUT.relative_to(BACKEND_DIR.parent)} ({len(app.openapi()['paths'])} paths)")


if __name__ == "__main__":
    main()
