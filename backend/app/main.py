"""
Trellis FastAPI application entry point.

Lifespan (Ticket 08, Ticket 12 D11):
    Opens the LangGraph Postgres checkpointer (chat memory in Neon) once at
    startup, builds the agent with it, and stores both on app.state
    (app.state.checkpointer, app.state.agent). Chat routes use them from there.
    The connection pool closes cleanly on shutdown.

Pattern reference:
    https://fastapi.tiangolo.com/advanced/events/
"""

import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from psycopg_pool import AsyncConnectionPool

from app.agent.graph import build_graph
from app.api.v1 import api_router
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

    # Chat memory (LangGraph checkpointer) lives in Neon in every environment (D11).
    # thread_id format: "{org_id}:{user_id}:{session_id}" (Ticket 08 invariant)
    # - direct (unpooled) URL: setup() runs LangGraph's own table migrations;
    # - check: Neon closes idle connections when it sleeps, so test each one on borrow;
    # - prepare_threshold=None: no server-side prepared statements (safe behind any pooler).
    # On Windows, psycopg's async mode needs the selector event loop: start the
    # backend with `uvicorn app.main:app --reload` or `fastapi dev`.
    async with AsyncConnectionPool(
        settings.sync_database_url,
        min_size=1,
        max_size=5,
        open=False,
        check=AsyncConnectionPool.check_connection,
        kwargs={"autocommit": True, "prepare_threshold": None},
    ) as pool:
        checkpointer = AsyncPostgresSaver(pool)
        await checkpointer.setup()  # creates/updates LangGraph's checkpoint tables; safe to repeat
        app.state.checkpointer = checkpointer
        app.state.agent = build_graph(checkpointer)
        yield
    # pool closes here: every connection returned and closed.


app = FastAPI(
    title=settings.APP_NAME,
    version="0.1.0",
    description="Role-aware agentic RAG workspace API",
    lifespan=lifespan,
)

app.include_router(api_router)


# ─── Health check ─────────────────────────────────────────────────────────────

@app.get("/health", tags=["meta"])
async def health():
    """Liveness probe — returns 200 if the process is running."""
    return {"status": "ok", "app": settings.APP_NAME}
