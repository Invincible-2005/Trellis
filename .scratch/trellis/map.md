# Wayfinder Map: Trellis MVP Architecture & Build Roadmap

## Destination

A complete, working, role-aware agentic RAG workspace built by a 3-person team in 3 months. Features strict hierarchical access control (documents accessible only to the owning role and above; zero cross-team data leakage), an agentic RAG chatbot enforcing scope at the retrieval/tool layer, role-scoped dashboards, and an admin console for org/role configuration.

## Notes

- **Team**: 3 B.Tech CSE seniors (1 Frontend, 1 Backend+DB, 1 Agentic Workflows & System Architecture/Lead)
- **Timeline**: 3 months
- **Tracker**: Local Markdown (`.scratch/trellis/issues/`)
- **Key Skills to Consult**: `domain-modeling`, `grilling`
- **Core Architectural Invariant**: Never trust the LLM or frontend for security. Access scope resolution (`resolve_scope()`) happens strictly in the database/backend layer. The LLM calls typed tools with server-injected `AccessScope` — it never receives or manipulates the scope itself.

## Decisions so far

- [01-lock-core-tech-stack](./issues/01-lock-core-tech-stack.md): **Next.js + FastAPI + NeonDB (pgvector) + Clerk.** Python backend is non-negotiable for LangGraph/pgvector ecosystem. OpenAPI → `openapi-typescript` generates typed client for Next.js.
- [02-database-schema-hierarchical-rbac](./issues/02-database-schema-hierarchical-rbac.md): **Hybrid Role + Team model.** Roles are global to the org (tree, `parent_role_id`). Team membership stores a `role_id` per user per team — same user can be "Manager" in Team Alpha and "Employee" in Team Beta. Document access rule: a doc tagged to Role R is visible to R and all ancestors of R. A doc tagged to a Team is visible to all team members and all roles hierarchically above the team. **⚠️ CTE CORRECTED (2026-09-21):** Recursive vector search walks DOWN the tree (`r.parent_role_id = vr.id`) to find descendants — a logged-in HR user sees docs tagged to HR, Manager, and Employee (roles they govern), not Admin.
- [03-scope-resolution-engine](./issues/03-scope-resolution-engine.md): `resolve_scope(user_id, org_id)` — note: org_id required for multi-org. Returns `AccessScope` (visible_role_ids, allowed_team_ids, permissions_by_team). Auth: `PyJWT` + `cryptography` via `PyJWKClient` verifying Clerk JWTs. Cache: `cachetools.TTLCache` in-memory (max 1000, 5-min TTL) for MVP — no Redis setup needed. Explicit invalidation on role or team membership changes.
- [Embedding model decided]: `mxbai-embed-large-v1` (1024 dims). Open source, free embedding model. Schema column is `Vector(1024)`. Ingestion calls HuggingFace Inference API to save backend RAM.
- [File storage decided]: **UploadThing**. Direct browser/frontend uploads. FastAPI only receives the final CDN `file_url` string in DB (never processes raw file bytes).
- [Database migrations]: **Alembic** manages schema migrations for NeonDB. Direct URL for migrations, pooled URL for FastAPI async runtime.
- [04-agentic-rag-graph-design](./issues/04-agentic-rag-graph-design.md): **ReAct agentic loop** (not a hardcoded deterministic graph) with structural guardrails: 8-call step budget, Pydantic tool schema enforcement, server-injected `AccessScope` (LLM never sees or manipulates scope), loop detection, query rewrite capped at 2, groundedness check before synthesis. Tools: `search_documents`, `get_tasks`, `get_team_summary`, `create_task`, `give_strike`, `give_commendation`. SSE event schema locked: `status`, `tool_call`, `token`, `citations`, `error`, `done`. Memory via `AsyncSqliteSaver` keyed by `{org_id}:{user_id}:{session_id}` — multiple named threads per user, visible to that user only. Migration to `AsyncPostgresSaver` (NeonDB) is a one-line swap.
- [10-langgraph-graph-code-structure](./issues/10-langgraph-graph-code-structure.md): Node contracts & execution topology locked. Pre-graph Guardrails AI filter; 3-way Router (`conversational`, `retrieve`, `write`); "Retrieve inside Write" for compound queries; pgvector HNSW (`<=>`) & typed relational tools (`get_tasks`, `get_team_summary`); 2x rewrite budget with Plain LLM refusal escape hatch; `@mention` entity disambiguation; HITL Pattern A (Conversational confirmation) for strikes.
- [Permission actions decided]: `create_role`, `create_team`, `add_member`, `upload_document`, `assign_task`, `give_strike`, `view_aggregate`, `review_strike`.
- [Strike system]: Strike highlights to direct manager (role immediately above in team). Threshold (3 strikes) escalates to next level up. Commendation system (`give_commendation`) included in MVP as positive counterpart — same hierarchy check, no RAG validation needed.

## Not yet specified

- **Dynamic Access Escalation**: `request_access(topic, reason)` workflow — user requests access to out-of-scope document, triggers notification to manager/admin for approval. Deferred from MVP (zero-result refusal is the safe v1 behavior); kept here for v2 graduation.
- **Scoring & Evaluation Suite**: Red-teaming benchmark and automated prompt injection defense testing.
- **Real-time vs. polling**: WebSocket vs. SSE vs. short-polling for live task/notification updates (chat streaming is SSE; this is about dashboard/task status refresh).
- **Document versioning**: What happens to vector chunks when an SOP document is updated?
- **Strike appeal flow**: Employee disputes a strike → flagged to HR / `review_strike`-permissioned role.

## Open tickets (frontier)

- [08-chat-session-management](./issues/08-chat-session-management.md): Session metadata schema, CRUD endpoints, SQLite checkpointer lifecycle, org-isolation invariant. **Unblocked.**
- [09-sse-streaming-implementation](./issues/09-sse-streaming-implementation.md): FastAPI SSE emitter from LangGraph nodes + Next.js BFF proxy contract + frontend consumption. **Blocked by 05.**
- [05-api-contract-and-type-gen](./issues/05-api-contract-and-type-gen.md): FastAPI OpenAPI contract + Next.js `openapi-typescript` codegen. **Unblocked.**
- [06-admin-role-hierarchy-ui](./issues/06-admin-role-hierarchy-ui.md): Admin console React Flow hierarchy tree + team/doc management UI. **Blocked by 05.**
- [07-role-scoped-chat-and-dashboard-ui](./issues/07-role-scoped-chat-and-dashboard-ui.md): Chat UI (streaming, citations, thinking-stepper) + Recharts dashboard widgets. **Blocked by 04, 05.**

## Open backend decisions (undecided)

1. **API Endpoints Contract & Pydantic Schemas ([Ticket 05](./issues/05-api-contract-and-type-gen.md))**:
   - Exact request/response DTOs for `/auth/me`, `/organizations`, `/teams`, `/roles`, `/tasks`, `/documents`, `/strikes`, `/dashboard`.
   - Needs discussion to unblock both backend and frontend development.
2. **Document Ingestion & Chunking Pipeline**:
   - Chunk size, overlap, and tokenizer strategy (to be resolved in agentic sessions).
   - Sync vs. Async background chunking (FastAPI `BackgroundTasks` vs queue).
   - Ingestion trigger flow: after UploadThing uploads file to CDN, backend fetches text → chunks → calls HuggingFace API for embeddings → writes to `document_chunks`.
3. **Task & Strike Event Escalation / Notifications**:
   - How does a manager or employee get alerted (in-app notification table vs email vs polling)?
4. **Strike Appeal Flow Details**:
   - UI and endpoint workflow for reviewing and dismissing strikes.

## Out of scope

- Payroll, legal HR, or full enterprise resource planning modules.
- Multi-tenant SaaS billing / Stripe integration (v1 = single org workspace).
- Natural language admin role configuration via chat ("AI admin").
- Full LLM-generated raw SQL queries (replaced by typed tool binding).

