"""
Delete files in UploadThing that no document or task hand-in uses (optional helper,
ticket 12 D64).

    uv run python scripts/clean_upload_leftovers.py            # only list them
    uv run python scripts/clean_upload_leftovers.py --delete   # delete them

The upload dialogs already delete a file that was never saved (closed, Back, save
failed). This catches the rest, e.g. a tab closed in the middle of an upload. Only
files older than 24 hours are touched, so an upload someone is still filling in is
safe. Checks every org: all orgs share one UploadThing app.

Needs DATABASE_URL and UPLOADTHING_TOKEN (same value as in frontend/.env) in backend/.env.
"""
import asyncio
import base64
import json
import sys
import time
from pathlib import Path

import httpx

BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

from sqlalchemy import select  # noqa: E402

from app.core.config import settings  # noqa: E402  (needs the path set above)
from app.core.database import async_session, engine  # noqa: E402
from app.models import Document, TaskSubmission  # noqa: E402
from app.services.documents import file_key  # noqa: E402

API = "https://api.uploadthing.com/v6"
MIN_AGE_HOURS = 24


def api_key() -> str:
    """The secret API key inside UPLOADTHING_TOKEN (base64 JSON with apiKey, appId, regions)."""
    if not settings.UPLOADTHING_TOKEN:
        sys.exit("Set UPLOADTHING_TOKEN in backend/.env (copy it from frontend/.env).")
    token = settings.UPLOADTHING_TOKEN.strip("'\"")
    return json.loads(base64.b64decode(token + "=" * (-len(token) % 4)))["apiKey"]


def list_stored_files(client: httpx.Client) -> list[dict]:
    files, offset = [], 0
    while True:
        response = client.post(f"{API}/listFiles", json={"limit": 500, "offset": offset})
        response.raise_for_status()
        page = response.json()
        files.extend(page["files"])
        if not page.get("hasMore"):
            return files
        offset += len(page["files"])


async def used_keys() -> set[str]:
    """File keys of every document and hand-in, in every org."""
    async with async_session() as db:
        links = [
            *(await db.scalars(select(Document.file_url))),
            *(await db.scalars(select(TaskSubmission.file_url))),
        ]
    await engine.dispose()
    return {key for link in links if (key := file_key(link))}


def main() -> None:
    delete = "--delete" in sys.argv[1:]
    with httpx.Client(headers={"X-Uploadthing-Api-Key": api_key()}, timeout=30) as client:
        stored = list_stored_files(client)
        used = asyncio.run(used_keys())
        cutoff_ms = (time.time() - MIN_AGE_HOURS * 3600) * 1000
        unused = [f for f in stored if f["key"] not in used]
        leftovers = [f for f in unused if f["uploadedAt"] < cutoff_ms]

        print(f"{len(stored)} files in UploadThing, {len(stored) - len(unused)} used by documents or hand-ins.")
        if len(unused) > len(leftovers):
            print(f"{len(unused) - len(leftovers)} unused file(s) are younger than {MIN_AGE_HOURS} hours; left alone.")
        if not leftovers:
            print("No leftovers to delete.")
            return
        print(f"{len(leftovers)} leftover(s):")
        for f in leftovers:
            uploaded = time.strftime("%Y-%m-%d %H:%M", time.localtime(f["uploadedAt"] / 1000))
            print(f"  {uploaded}  {f['name']}")
        if not delete:
            print("Nothing deleted. Run again with --delete to delete these.")
            return

        response = client.post(f"{API}/deleteFiles", json={"fileKeys": [f["key"] for f in leftovers]})
        response.raise_for_status()
        print(f"Deleted {response.json().get('deletedCount', len(leftovers))} file(s).")


if __name__ == "__main__":
    main()
