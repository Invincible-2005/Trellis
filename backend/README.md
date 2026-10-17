# Trellis Backend

The FastAPI service for Trellis: authentication checks, role-based access control, the database, document ingestion and the LangGraph chat agent. Every route lives under `/api/v1`.

For what Trellis is and how to set up the whole project, see the [root README](../README.md).

## Quick start

```bash
uv sync                                   # install dependencies into .venv
uv run alembic upgrade head               # create/update tables (also enables pgvector)
uv run uvicorn app.main:app --reload      # http://127.0.0.1:8000
```

Needs `backend/.env` (`DATABASE_URL`, `DATABASE_URL_POOLED`, `CLERK_SECRET_KEY`, `CLERK_ISSUER`, `GOOGLE_API_KEY`). The full list is in the root README, section 7.2. Other settings and their defaults are in `app/core/config.py`.

Interactive API docs: <http://127.0.0.1:8000/docs>. Health check: `/health`.

On Windows, start the server with `uvicorn app.main:app --reload` or `fastapi dev`, not a custom launcher, because the chat memory connection needs the selector event loop.

## Common tasks

| Task | Command |
|---|---|
| Run the tests | `uv run pytest` |
| Create a migration after changing a model | `uv run alembic revision --autogenerate -m "message"` |
| Apply migrations | `uv run alembic upgrade head` |
| Regenerate `openapi.json` after changing an endpoint | `uv run python scripts/export_openapi.py` |
| Chat with the agent in the terminal as a real user | `uv run python scripts/try_agent.py you@example.com` |
| Score chat answer quality (DeepEval) | see `evaluation/` (`run_agent.py` collects answers, then `score.py` scores them) |

After regenerating `openapi.json`, run `pnpm api:generate` in `frontend/` so the typed client stays in sync.

## Folder guide

| Folder | What belongs there |
|---|---|
| `app/api/v1/` | Routers, one per group of routes. Thin: read the request, call a service, return a schema. |
| `app/schemas/` | Pydantic request and response shapes. |
| `app/models/` | SQLAlchemy tables. |
| `app/services/` | Business logic and data-access functions (they require `scope`), plus calls to Clerk and Gemini. |
| `app/scope/` | `resolve_scope()` and `AccessScope`. |
| `app/core/` | Settings, database session, JWT check, shared dependencies, the error helper. |
| `app/agent/` | The LangGraph agent: state, tools, prompts, graph, confirmable actions. |
| `alembic/versions/` | Database migrations. |
| `tests/`, `scripts/`, `evaluation/` | Tests, developer helpers, answer-quality evaluation. |

## How a request is checked

```
verify Clerk JWT → get_identity → get_org_context → resolve_scope() → AccessScope
```

- User and org come **only** from the verified token. Clerk proves identity; the Trellis database decides permissions.
- `AccessScope` is built once per request and passed into the shared service functions. REST routes and agent tools call the same functions, so they cannot disagree.
- The agent receives the scope as runtime context, never in its state or tool schemas.
- Every error has the shape `{"detail": {"code", "message"}}` (use `api_error` from `app/core/errors.py`).

## Adding an endpoint

1. Router in `app/api/v1/` and register it in `app/api/v1/__init__.py`. A router with org data adds `dependencies=[Depends(get_org_context)]`.
2. Schemas in `app/schemas/`, logic in `app/services/`.
3. New table or column: model in `app/models/` (import it in `app/models/__init__.py`) plus an Alembic migration.
4. Regenerate `openapi.json`, then the frontend types.

Check `CLAUDE.md` in this folder before creating or moving files. The settled design decisions are in [`.scratch/trellis/map.md`](../.scratch/trellis/map.md).
