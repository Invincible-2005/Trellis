# Trellis — Role-Aware Agentic RAG Workspace

**Tagline:** Guardrails that support growth, not just block it.

**Status:** Draft v2 — Decisions Locked (Post-Wayfinder)
**Last updated:** 2026-09-13

---

## 1. Overview

Trellis is a business workspace application where an **Admin defines roles and a permission hierarchy**, documents and task data are organized under that hierarchy, and every user — across custom-named roles at any depth — interacts with the system through two surfaces:

1. A **role-scoped dashboard** showing tasks, deadlines, and metrics relevant to that person's position in the hierarchy.
2. An **agentic RAG chatbot** that answers natural-language questions by retrieving only the documents and data the asking user is authorized to see, and can take limited actions on their behalf (including strike issuance, validated against org policy).

The core thesis: **access control is enforced structurally, at the retrieval and tool-execution layer, not just suggested by the prompt.** Every architectural decision serves that guarantee.

---

## 2. Problem Statement

Real organizations are hierarchical: an Employee should only see their own work, a Manager their team's, HR all teams under them, and an Admin configures who gets to see what. A naive approach — "just put documents in separate folders" — collapses the moment:

- A single answer needs to blend permitted and non-permitted information (partial access within one query)
- A user (or an attacker) tries to manipulate the LLM into ignoring its scope (prompt injection)
- The agent needs to *act* (issue strikes, export, notify) — and those actions need their own permission checks
- Access needs to be **aggregated upward** (HR sees rollup stats across teams) without leaking row-level detail the requester isn't cleared for

Trellis solves these specifically using a hierarchical, admin-configurable role system enforced at every layer: retrieval, tool execution, and aggregation.

---

## 3. Goals & Non-Goals

**Goals**
- Admin-configurable, arbitrarily deep role hierarchy (not a fixed 4-role model)
- Multi-organization support: one Clerk user can belong to multiple Trellis orgs
- Hybrid role model: global org roles + per-team role assignment (same user can be Manager in one team, Employee in another)
- Document and task data scoped to roles/teams, enforced at query time
- Two document types: **policy/SOP docs** (governance, used for RAG) and **task submissions** (work deliverables, like Google Classroom)
- Agentic chatbot that decides how to answer, always respecting the caller's resolved scope
- Strike system: validated by RAG agent against org policy before writing to DB; appeal flow with `review_strike`-permissioned roles
- Role-scoped dashboards for task/deadline visibility
- A demonstrable guardrail layer (permission bypass attempts fail, provable via audit log)

**Non-Goals (for v1 / MVP)**
- Real payroll, benefits, or legal HR functionality
- Massive scale (millions of documents) — design scales, but MVP is validated at workspace scale
- Full natural-language admin configuration ("set up a role via chat")
- Document versioning (what happens to chunks when a doc is updated — deferred)
- Real-time WebSocket updates (short-polling or SSE sufficient for v1)

---

## 4. Users & Role Hierarchy

Roles are **not hardcoded** — an Admin (or any role with `create_role` permission) defines roles. The hierarchy is a tree stored via `parent_role_id`.

```
Organization
  └── Roles (global, arbitrary depth, tree via parent_role_id)
        Admin
          └── HR (example)
                └── Manager (example)
                      └── Employee (example)

  └── Teams (units of work within the org)
        Team Alpha
          ├── User A — role: Manager
          └── User B — role: Employee
        Team Beta
          ├── User C — role: Manager
          └── User A — role: Employee   ← same user, different role per team
```

**Key invariants:**
- A user's role is **contextual to the team** they're in (`team_members.role_id`)
- Every permission check starts from `org_id` as the isolation boundary
- `resolve_scope(user_id, org_id)` dynamically resolves allowed teams and accessible role ancestry — never inferred from a static label

**Document access rules (confirmed):**
- A policy/SOP doc tagged to Role R → visible to R **and all ancestors of R** only (siblings/cousins cannot see it)
- A doc tagged to Team T → visible to all Team T members **and all roles hierarchically above Team T**
- A doc is tagged to **either** a role **or** a team — not both — at upload time

**Role permissions (action enum):**
`create_role`, `create_team`, `add_member`, `upload_document`, `assign_task`, `give_strike`, `view_aggregate`, `review_strike`

---

## 5. High-Level Architecture

```
┌─────────────────┐        ┌──────────────────────┐        ┌──────────────────────┐
│   Next.js App   │  HTTP  │      FastAPI          │  SQL   │  NeonDB (Postgres)   │
│  (App Router,   │───────▶│  (Backend API +       │───────▶│  + pgvector ext.     │
│   TypeScript)   │◀───────│   Agent Orchestration) │◀──────│  (relational+vector) │
└─────────────────┘        └──────────────────────┘        └──────────────────────┘
        │                            │
        │                            ├── Auth verification (JWT via Clerk → FastAPI Depends)
        ▼                            ├── resolve_scope(user_id, org_id) [Redis-cached]
   Clerk                             ├── Agent graph (LangGraph)
   (Identity —                       │     ├── decision node
    multi-org                        │     ├── tool-bound LLM (typed tools only — no raw SQL)
    via Clerk Orgs)                  │     │     ├── search_documents(scope)       ← pgvector
                                     │     │     ├── get_tasks(scope, filters)     ← SQL
                                     │     │     ├── get_team_summary(scope)       ← SQL aggregate
                                     │     │     ├── give_strike(to, reason)       ← RAG-validated
                                     │     │     └── request_access(doc_id)        ← escalation
                                     │     ├── relevancy grader
                                     │     ├── query rewrite loop (capped at 2)
                                     │     └── groundedness check
                                     ├── Guardrails AI validators + audit logger
                                     └── Uploadthing (file uploads for task submissions)
```

**Why this shape:**
- Next.js never talks to the database directly — all permission logic lives in FastAPI, one enforcement point
- Arcjet at the Next.js edge handles transport-layer abuse (rate limiting, bot protection)
- All data — relational and vector — lives in one NeonDB Postgres instance, so permission filtering and semantic search happen in a single SQL query

---

## 6. Frontend (Next.js)

- **Framework:** Next.js 14+ (App Router), TypeScript, TailwindCSS, shadcn/ui
- **Auth:** Clerk (multi-org Organizations API — handles org-switching natively)
- **API layer:** FastAPI OpenAPI JSON → `openapi-typescript` generates types → `openapi-fetch` typed client. End-to-end type safety without a second backend runtime.
- **Security:** Arcjet middleware wraps sensitive routes
- **File uploads:** Uploadthing SDK (free tier: 2GB + 100GB bandwidth/month; purpose-built for Next.js)
- **Key surfaces:**
  - Landing page (static — Navbar with Sign In/Sign Up, About)
  - Org selection / creation screen (post-auth, Clerk org context)
  - Admin console: interactive role hierarchy tree (React Flow), team creation, document upload & tagging, user invite management
  - Role-scoped dashboard (Recharts — task/deadline metrics scoped to viewer's role)
  - Chat interface for the agentic RAG assistant (streaming SSE, citation badges)

---

## 7. Backend (FastAPI)

- **Framework:** FastAPI (Python 3.11+)
- **ORM:** SQLAlchemy (async, with asyncpg driver) + Alembic for migrations
- **Auth enforcement pattern:** FastAPI `Depends()` chain verifies Clerk JWT, extracts `user_id` + `org_id`, and calls `resolve_scope()` before the route body runs:

```python
async def get_current_user(token: str = Depends(oauth2_scheme)) -> ScopedUser:
    payload = decode_clerk_jwt(token)
    return await resolve_scope(payload["sub"], payload["org_id"])  # Redis-cached

@router.post("/chat")
async def chat(query: ChatRequest, user: ScopedUser = Depends(get_current_user)):
    ...
```

- **Scope resolution caching:** `resolve_scope(user_id, org_id)` cached in Redis (TTL ~60s), explicitly invalidated when admin modifies roles or team membership.
- **Agent orchestration:** LangGraph graph runs inside FastAPI request handling for `/chat`

---

## 8. Database (NeonDB — Postgres + pgvector)

Single database, two kinds of data, one enforcement point.

**ORM stack:** SQLAlchemy (async) + Alembic + `pgvector-python`

**Core tables:**

```
organizations(id, name, clerk_org_id, created_by_user_id, created_at)
users(id, clerk_user_id, email, name, created_at)             -- NO org_id: multi-org
org_members(id, org_id, user_id, joined_at)                   -- bridge: user ↔ org

roles(id, org_id, name, description, parent_role_id, permissions[], created_by_user_id)
teams(id, org_id, name, created_by_user_id, created_at)
team_members(id, team_id, user_id, role_id, joined_at)        -- role is per-team membership

-- Policy/SOP documents (for RAG) — tagged to Org, Role, or Team
documents(id, org_id, title, description?, file_url, file_type ENUM('pdf','docx','pptx','txt','md'),
          scope_type ENUM('org','role','team'), role_id?, team_id?,
          uploaded_by_user_id, status ENUM('processing','ready','failed'), chunk_count?, created_at, updated_at)

-- Vector chunks — scope columns DENORMALIZED for fast WHERE filtering
document_chunks(id, document_id, content, embedding VECTOR(1024),
                chunk_index, org_id, scope_type ENUM('org','role','team'), role_id?, team_id?)

-- Task work items with dependency DAG
tasks(id, team_id, title, description, assigned_to_user_id, created_by_user_id,
      deadline, status ENUM('todo','in_progress','done','blocked'), blocked_by_task_id?)

-- Task deliverables (like Google Classroom submissions — separate from policy docs)
task_submissions(id, task_id, submitted_by_user_id, file_url, notes, submitted_at)

-- Task contextual comment threads (team task discussions)
task_comments(id, task_id, user_id, content, created_at)

-- User chat session metadata (message checkpoint blobs stored in SQLite checkpoints.db)
chat_sessions(id, org_id, user_id, title?, created_at, last_active_at)

-- Strike system
strikes(id, org_id, team_id, given_by_user_id, given_to_user_id,
        reason, policy_chunk_ids[], agent_evaluation,
        status ENUM('pending_agent_review','confirmed','appealed','dismissed'),
        reviewed_by_user_id?, appeal_notes?,
        escalated BOOL, created_at)

-- Immutable audit log
audit_log(id, org_id, user_id, role_ids_at_time[], query, tools_called[],
          chunks_retrieved_ids[], chunks_denied_count, answer_summary, created_at)
```

**Embedding model:** `mxbai-embed-large-v1` (1024 dimensions) — top-ranked open-source on MTEB. Run via Ollama locally (dev) or Mixedbread AI API free tier (prod).

**Retrieval + permission filtering as one operation:**

```sql
-- Resolve visible role IDs (walk DOWN the tree to find descendants / governed roles)
WITH RECURSIVE visible_roles AS (
    SELECT id FROM roles WHERE id = ANY(:user_role_ids_in_this_org)
    UNION ALL
    SELECT r.id FROM roles r
    INNER JOIN visible_roles vr ON r.parent_role_id = vr.id
    WHERE r.org_id = :org_id
)
SELECT id, content, embedding <=> :query_vec AS distance
FROM document_chunks
WHERE org_id = :org_id
  AND (
    (scope_type = 'org'   AND org_id = :org_id)
    OR
    (scope_type = 'role'  AND role_id IN (SELECT id FROM visible_roles))
    OR
    (scope_type = 'team'  AND team_id = ANY(:allowed_team_ids))
  )
ORDER BY embedding <=> :query_vec
LIMIT 5;
```

**Required indexes:**
```sql
CREATE INDEX ON document_chunks USING hnsw (embedding vector_cosine_ops);
CREATE INDEX ON document_chunks (org_id, scope_type);
CREATE INDEX ON document_chunks (org_id, scope_type, role_id);
CREATE INDEX ON document_chunks (org_id, scope_type, team_id);
CREATE INDEX ON roles (org_id, parent_role_id);
CREATE INDEX ON team_members (user_id);
CREATE INDEX ON tasks (team_id, deadline, status);
CREATE INDEX ON task_comments (task_id, created_at);
CREATE INDEX ON chat_sessions (user_id, org_id, last_active_at DESC);
CREATE INDEX ON audit_log (org_id, created_at DESC);
```

---

## 9. RAG / Agentic Chatbot Design

The chatbot is implemented as a LangGraph graph. The LLM is **bound to typed tools only — it never writes raw SQL or receives the raw access scope as a parameter it can manipulate.**

**Graph flow:**

1. **Decision node** — classify intent: conversational/meta → answer directly; workspace data question → route to tools
2. **Tool-bound LLM node** — LLM decides which typed tools to call:
   - `search_documents(query)` — vector search over authorized chunks only (scope injected server-side)
   - `get_tasks(filters)` — structured query over authorized tasks only
   - `get_team_summary()` — aggregated rollup, row-level detail withheld unless authorized
   - `give_strike(to_user_id, reason)` — validates caller is hierarchically above target, RAG-fetches org policy docs, agent evaluates reason against policy, then writes if valid
   - `request_access(doc_id)` — escalation path for out-of-scope requests
3. **Authorization filter (inside every tool, not the LLM's judgment)** — each tool independently calls `resolve_scope()` from the database before returning anything, regardless of LLM output. This is the actual guardrail boundary — holds even under successful prompt injection.
4. **Relevancy grading** — retrieved chunks graded for relevance before synthesis
5. **Query rewrite loop** — if relevancy fails, query is rewritten and retried, capped at 2 iterations
6. **Groundedness check** — every claim in the final answer must trace to a retrieved, authorized chunk. Ungrounded claims are cut or qualified.
7. **Zero-result handling** — if scope filtering leaves nothing, the agent says so explicitly rather than hallucinating
8. **Step budget** — hard cap on total tool calls per query to prevent runaway cost/latency

---

## 10. Strike System

The strike system is an agentic workflow, not a simple button:

1. Higher-role user calls `give_strike(to_user_id, reason)` via chat or UI
2. Backend verifies caller's role is hierarchically above target's role in the same team
3. Agent fetches org policy/SOP documents via RAG (`search_documents`)
4. Agent evaluates whether the stated reason is policy-compliant
5. If compliant: strike is written to DB with `status='confirmed'`, direct manager notified
6. If non-compliant: strike is rejected with agent's reasoning returned to caller
7. **Threshold**: 3 confirmed strikes against a user → `escalated=True` → next-level-up role notified
8. **Appeal**: struck user can dispute → `status='appealed'` → any role with `review_strike` permission can review and `confirm` or `dismiss`

---

## 11. Guardrails Strategy

| Layer | Mechanism |
|---|---|
| Retrieval-time authorization | Custom — permission filter is part of every SQL/tool query itself (§8, §9) |
| Action-time authorization | Custom — every tool re-checks caller scope independently before executing |
| Content-safety / injection / PII | Guardrails AI validators on LLM input/output |
| Groundedness / citation check | Custom — verify answer claims map to authorized retrieved chunks |
| Transport-layer abuse | Arcjet (rate limiting, bot detection, shield) at the Next.js edge |
| Auditability | `audit_log` table — every query logs resolved scope, tools called, chunks retrieved vs. denied |

---

## 12. Dashboard

Scoped to the viewing role's authorized data:
- **Employee:** own tasks/deadlines and progress
- **Manager:** team's task/deadline aggregate + individual breakdowns
- **HR / higher:** cross-team overview (aggregate + drill-down without row-level detail outside authorization)
- **Admin:** full org visibility

Same `resolve_scope()` backs both dashboard queries and chatbot tools — one scope-resolution engine.

Chart library: **Recharts** (React-native, already in the Next.js ecosystem).

---

## 13. Admin Console

Accessible to Admin and any role with delegated permissions. Surfaces:
- **Role management:** visual interactive tree (React Flow) for creating roles, setting `parent_role_id`, assigning the permissions enum
- **Team management:** create teams, invite users by email, assign their role within the team
- **Document management:** upload policy/SOP docs, tag to a role or a team (not both), triggers chunking + embedding pipeline
- **User management:** view org members, reassign roles within teams

---

## 14. Scoring Model

- Each task scored **[0, 1]** based on on-time completion (via `deadline` and `status`)
- Surface as a **trend over time** on the dashboard — not a single punitive number
- Strike history visible to authorized roles in the same hierarchy branch

---

## 15. Open Questions

- **File storage beyond free tier:** Uploadthing (2GB free) for v1. If task submission volume exceeds this, migrate to Cloudflare R2 (10GB free) — S3-compatible, low migration cost.
- **Document versioning:** What happens to existing vector chunks when a policy doc is edited? (Deferred — for v1, re-upload creates a new document record and old chunks are deleted.)
- **Real-time updates:** Short-polling or SSE for task/notification updates. WebSocket deferred to v2.
- **Commendation system:** Positive counterpart to strikes (same table structure, `type ENUM('strike','commendation')`). Deferred to stretch goal.
- **Strike appeal reviewer UX:** Any `review_strike`-permissioned role reviews it in the admin panel. UI design deferred.

---

## 16. MVP Scope (recommended cut for the deadline)

**In scope for v1:**
- Multi-org Clerk auth, org selection/creation screen
- Hybrid role hierarchy (tree, admin-configurable), with per-team role assignment
- Core guardrail: scoped retrieval + scoped tool execution + audit log
- Agent graph: decision → tool-bound LLM → scoped retrieval → relevancy grade → rewrite (capped) → groundedness check
- Policy/SOP document upload, chunking with `mxbai-embed-large`, tagging to role or team
- Task submissions via Uploadthing (separate from policy docs)
- Task management with deadline tracking and `blocked_by` dependency
- Role-scoped dashboards (basic Recharts)
- Strike system with RAG validation and threshold escalation
- Admin console (role tree, team management, document management)
- One convincing red-team demo (prompt injection attempt fails safely, shown live)

**Defer to stretch goals:**
- Fully generalized arbitrary-depth role nesting UI (tree renders fine; UX for deep nesting is stretch)
- Natural-language admin configuration
- Formal guardrail evaluation suite / red-team metrics
- Reranking / hybrid search
- Query splitting for parallel sub-retrieval
- Commendation system
- Strike appeal UI
- Document versioning
- Real-time WebSocket updates

---

## 17. Deployment

- **Frontend:** Vercel (Next.js)
- **Backend:** Railway or Render (FastAPI)
- **Database:** NeonDB (Postgres + pgvector)
- **Cache:** Upstash Redis (scope resolution caching)
- **Identity:** Clerk (multi-org Organizations API)
- **File Storage:** Uploadthing (free tier for v1; migrate to Cloudflare R2 if needed)
- **Security/edge:** Arcjet (Next.js middleware)

---

## 18. Tech Stack Summary

| Layer | Choice | Notes |
|---|---|---|
| Frontend | Next.js 14+ (App Router, TypeScript, TailwindCSS, shadcn/ui) | |
| Transport/typing | FastAPI OpenAPI → `openapi-typescript` | End-to-end type safety, no oRPC (TS-only, incompatible) |
| Backend | FastAPI (Python 3.11+) | |
| ORM | SQLAlchemy (async) + Alembic | SQLModel dropped — SQLAlchemy gives more control for complex hierarchical queries |
| Agent orchestration | LangGraph | |
| Database | NeonDB (Postgres + pgvector) | |
| Embedding model | `mxbai-embed-large-v1` via Mixedbread AI API / Ollama | 1024 dimensions; top open-source MTEB rank; free for dev/MVP |
| Cache | Redis (Upstash) | |
| Auth | Clerk (multi-org Organizations API) | |
| File uploads | Uploadthing | Task submissions; 2GB free; built for Next.js |
| Security (edge) | Arcjet | |
| Guardrails (content) | Guardrails AI + custom validators | |
| Charts | Recharts | |
