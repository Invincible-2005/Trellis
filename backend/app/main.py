"""
Trellis FastAPI application entry point.

Lifespan (Ticket 08):
    Opens the LangGraph SQLite checkpointer once at startup and stores it on
    app.state.checkpointer. Every route that invokes the agent graph reads it
    from there. Closes cleanly on shutdown — no data loss.

Pattern reference:
    https://fastapi.tiangolo.com/advanced/events/
"""

import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver

from app.core.config import settings
from app.services.ingestion import fail_stale_ingestions

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage long-lived resources across the application lifetime."""
    # Documents left in 'processing' by a previous run can never finish (Ticket 11 / 12 D11).
    # Best-effort: a DB hiccup here must not block startup.
    try:
        stale = await fail_stale_ingestions()
        if stale:
            logger.warning("Marked %d stale 'processing' documents as failed", stale)
    except Exception:
        logger.exception("Stale-ingestion sweep failed; continuing startup")

    # Open SQLite checkpointer — this is the LangGraph conversation memory store.
    # thread_id format: "{org_id}:{user_id}:{session_id}" (Ticket 08 invariant)
    async with AsyncSqliteSaver.from_conn_string(settings.CHECKPOINTS_DB_PATH) as saver:
        app.state.checkpointer = saver
        yield
    # saver closes here automatically — WAL checkpoint, connection closed.


app = FastAPI(
    title=settings.APP_NAME,
    version="0.1.0",
    description="Role-aware agentic RAG workspace API",
    lifespan=lifespan,
)


# ─── Health check ─────────────────────────────────────────────────────────────

@app.get("/health", tags=["meta"])
async def health():
    """Liveness probe — returns 200 if the process is running."""
    return {"status": "ok", "app": settings.APP_NAME}
