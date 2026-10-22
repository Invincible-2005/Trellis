"""
Re-cut and re-embed documents that are already uploaded (optional helper, ticket 12 D58).

    uv run python scripts/reindex_documents.py --dry-run            # show the new pieces, change nothing
    uv run python scripts/reindex_documents.py                      # every ready document, every org
    uv run python scripts/reindex_documents.py "Kestrel Software Pvt Ltd"   # one org

Needed once after the way documents are cut changes (D58: one piece per section,
400-1,000 characters). Each document is downloaded again, cut the new way and
embedded; its pieces are swapped in one commit. If something fails (e.g. the free
embedding limit of 1,000 pieces a day), that document keeps its old pieces and
stays 'ready', so the run can simply be started again later.

Needs DATABASE_URL and GOOGLE_API_KEY in backend/.env.
"""
import asyncio
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

from sqlalchemy import select  # noqa: E402

from app.core.database import async_session, engine  # noqa: E402
from app.models import Document, Organization  # noqa: E402
from app.services.embeddings import EmbeddingError, embed_documents  # noqa: E402
from app.services.ingestion import (  # noqa: E402
    IngestionError,
    _chunk_text,
    _extract_text,
    _fetch_file,
    _replace_chunks,
)


async def reindex(document_id, dry_run: bool) -> str:
    async with async_session() as db:
        document = await db.get(Document, document_id)
        try:
            raw = await _fetch_file(document.file_url)
            text = await asyncio.to_thread(_extract_text, raw, document.file_type)
            pieces = _chunk_text(text, document.file_type, document.title)
            if not pieces:
                return "skipped: no text"
            if dry_run:
                return f"{document.chunk_count} -> {len(pieces)} pieces"
            vectors = await embed_documents(pieces)
            await _replace_chunks(db, document, pieces, vectors)
            old = document.chunk_count
            document.chunk_count = len(pieces)
            await db.commit()
            return f"{old} -> {len(pieces)} pieces, done"
        except (IngestionError, EmbeddingError) as exc:
            await db.rollback()
            return f"NOT changed: {exc}"


async def main() -> None:
    args = [a for a in sys.argv[1:] if a != "--dry-run"]
    dry_run = "--dry-run" in sys.argv[1:]
    async with async_session() as db:
        query = (
            select(Document.id, Document.title, Organization.name)
            .join(Organization, Organization.id == Document.org_id)
            .where(Document.status == "ready")
            .order_by(Organization.name, Document.title)
        )
        if args:
            query = query.where(Organization.name == args[0])
        documents = (await db.execute(query)).all()

    print(f"{len(documents)} ready document(s){' (dry run: nothing changes)' if dry_run else ''}.")
    failed = 0
    for document_id, title, org in documents:
        result = await reindex(document_id, dry_run)
        failed += result.startswith("NOT")
        print(f"  [{org}] {title}: {result}")
    await engine.dispose()
    if failed:
        print(f"{failed} document(s) kept their old pieces. Run again later to finish.")


if __name__ == "__main__":
    asyncio.run(main())
