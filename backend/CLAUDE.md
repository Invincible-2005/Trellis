# Backend: where files go

Before creating or moving any file in `backend/`, check this map. If the right place isn't obvious, **ask the user** (plain words, one question, one recommendation) instead of guessing or inventing a new folder.

## Folder map

| Folder | What belongs there | Example |
|---|---|---|
| `app/api/v1/` | One file per group of routes (FastAPI routers). Thin: read the request, call a service, return a schema. Each router is added in `app/api/v1/__init__.py`. | `auth.py` |
| `app/schemas/` | Pydantic request/response shapes, one file per route group, same name as the router. | `auth.py` |
| `app/models/` | SQLAlchemy database tables, one file per concept. Import new ones in `app/models/__init__.py`. | `team.py` |
| `app/services/` | Business logic and calls to outside services (Clerk, document ingestion). Data-access functions that take `scope` live here, so REST routes and agent tools share them. | `ingestion.py` |
| `app/scope/` | `resolve_scope()` and `AccessScope`. Only access-scope logic. | `resolver.py` |
| `app/core/` | App-wide plumbing: settings, DB session, JWT check, shared dependencies, error helper. | `deps.py`, `errors.py` |
| `app/agent/` | LangGraph agent: state, tools, graph. Never put authorization data in `AgentState`. | `state.py` |
| `alembic/versions/` | Database migrations. Any table or column change needs one. | |
| `tests/` | Optional checks, named `test_<thing>.py`. Only add tests when the user asks. | |
| `scripts/` | Small developer helpers run by hand. | `export_openapi.py` |
| `evaluation/` | The chat's answer-quality evaluation (DeepEval, ticket 12 D57): the questions, the two scripts, and their `results/`. | `score.py` |

## Rules of thumb
- A new endpoint = router in `api/v1/` + schemas in `schemas/` + logic in `services/`. Register the router in `api/v1/__init__.py`.
- A new router with org data (tasks, chat, dashboard…) gets `dependencies=[Depends(get_org_context)]` in its `APIRouter(...)`, like `admin.py`. The sign-in check is already on all of `/api/v1`.
- A new table = model in `models/` + an Alembic migration.
- Don't create a parallel package for something that already has a home (e.g. no second `auth/` next to `core/auth.py`). Extend the existing file.
- `openapi.json` is generated (`uv run python scripts/export_openapi.py`). Never edit it by hand; regenerate it after changing an endpoint.
- Locked rules (scope, identity, roles, `/api/v1` prefix) are in the root `AGENTS.md`. The tickets are under `.scratch/trellis/issues/`.

## When to ask
Ask the user before: adding a new top-level folder under `app/`, putting logic somewhere other than the table above, or splitting/merging an existing file. Explain with an app scenario, not file names alone.
