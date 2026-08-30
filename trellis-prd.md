# Trellis — Role-Aware Agentic RAG Workspace

**Tagline:** Guardrails that support growth, not just block it.

**Status:** Draft v1 — Group Project PRD
**Last updated:** 2026-08-24

---

## 1. Overview

Trellis is a business workspace application where an **Admin defines roles and a permission hierarchy**, documents and task data are organized under that hierarchy, and every user — Employee, Manager, HR, Admin, or a custom role — interacts with the system through two surfaces:

1. A **role-scoped dashboard** showing the data relevant to that person's position in the hierarchy.
2. An **agentic RAG chatbot** that answers natural-language questions by retrieving only the documents and data the asking user is authorized to see, and can take limited actions on their behalf.

The core thesis of the project is not "build a RAG chatbot" — it's **"build a system where access control is enforced structurally, at the retrieval and tool-execution layer, not just suggested by the prompt."** Every architectural decision in this document is made in service of that guarantee.

---

## 2. Problem Statement

Most RAG demos assume a single flat knowledge base with one implicit user. Real organizations are hierarchical: an Employee should only see their own work, a Manager should see their team's, HR should see all teams under them, and an Admin configures who gets to see what in the first place. A naive approach — "just put documents in separate folders" — collapses the moment:

- A single answer needs to blend permitted and non-permitted information (partial access within one query)
- A user (or an attacker) tries to manipulate the LLM into ignoring its scope (prompt injection)
- The agent needs to *act* (export, notify, flag) rather than just answer, and that action needs its own permission check
- Access needs to be **aggregated upward** (HR sees rollup stats across teams) without leaking row-level detail the requester isn't cleared for

Trellis is designed to solve these specifically, using a hierarchical, admin-configurable role system enforced at every layer: retrieval, tool execution, and aggregation.

---

## 3. Goals & Non-Goals

**Goals**
- Admin-configurable, arbitrarily deep role hierarchy (not a fixed 4-role model)
- Document and task data scoped to roles/teams, enforced at query time
- Agentic chatbot that decides how to answer (parametric knowledge vs. tool call vs. retrieval), always respecting the caller's resolved scope
- Role-scoped dashboards for task/deadline visibility
- A demonstrable, testable guardrail layer (permission bypass attempts fail, and it's provable via audit log)

**Non-Goals (for v1 / MVP)**
- Fully general document types beyond team SOPs/ethics guidelines/policy docs and task/deadline records
- Real payroll, benefits, or legal HR functionality
- Massive scale (millions of documents) — design should scale, but MVP is validated at workspace scale (thousands–low hundreds of thousands of chunks)
- Full natural-language admin configuration (e.g., "set up a role via chat") — manual admin UI is enough for v1

---

## 4. Users & Role Hierarchy

Roles are **not hardcoded** — an Admin (or a delegated Permission Admin) defines roles, and each role is granted access to specific teams, documents, and capabilities.

```
Admin
 └── Permission Admin (optional, admin-delegated)
      └── HR
           └── Team
                ├── Manager (supervises the team, assigns tasks)
                └── Employee(s) (execute tasks, see only their own data)
```

- The hierarchy can nest deeper than 4 levels — the schema does not assume a fixed depth.
- A user may hold more than one role (open design question — see §14).
- Every role's access is resolved dynamically via `resolve_scope(user_id)` — never inferred from a static label alone. A "Manager" role only grants access to the specific team(s) that manager actually supervises, checked against the org relationship in the database, not trusted from the request.

---

## 5. High-Level Architecture

```
┌─────────────────┐        ┌──────────────────────┐        ┌─────────────────────┐
│   Next.js App    │  HTTP  │      FastAPI          │  SQL   │   NeonDB (Postgres)  │
│  (Frontend +      │──────▶│  (Backend API +       │───────▶│  + pgvector extension │
│   Arcjet edge)    │◀──────│   Agent Orchestration) │◀──────│  (relational + vector)│
└─────────────────┘        └──────────────────────┘        └─────────────────────┘
        │                            │
        │                            ├── Auth verification (JWT, Depends chain)
        ▼                            ├── resolve_scope() [cached in Redis]
   Clerk / WorkOS                    ├── Agent graph (LangGraph)
   (Identity Provider)               │     ├── decision node
                                     │     ├── tool-bound LLM
                                     │     │     ├── search_documents (scoped)
                                     │     │     ├── get_deadlines (scoped)
                                     │     │     ├── get_team_summary (scoped)
                                     │     │     └── request_access
                                     │     ├── relevancy grader
                                     │     ├── query rewrite / split loop
                                     │     └── groundedness check
                                     └── Guardrails AI validators + audit logger
```

**Why this shape:**
- Next.js never talks to the database directly — it only calls FastAPI, so there is exactly one place (the backend) where permission logic can be enforced.
- Arcjet sits at the Next.js edge/middleware layer, since it's a JS/TS-native SDK — it protects the transport layer (rate limiting, bot detection, abuse patterns) before a request even reaches FastAPI. It is a complementary perimeter, not a replacement for backend-side RBAC.
- All application data — relational (users, roles, teams, deadlines) and vector (document chunk embeddings) — lives in **one NeonDB Postgres instance** via the pgvector extension. This means permission filtering and semantic search can happen in a single SQL query, with no second system to keep in sync.

---

## 6. Frontend (Next.js)

- **Framework:** Next.js (App Router), TypeScript
- **Auth:** Clerk or WorkOS SDK — both have a native "Organizations" concept that maps well onto the Admin→HR→Team hierarchy
- **API layer:** No custom RPC library (oRPC was considered but is TypeScript-server-only and doesn't fit a Python backend). Instead:
  - FastAPI's OpenAPI schema is exported and run through `openapi-typescript` to generate types
  - `openapi-fetch` (or similar) provides a typed client against those generated types
  - This gives end-to-end type safety without introducing a second backend runtime
- **Security:** Arcjet middleware wraps sensitive routes (auth, chat endpoint, admin actions) for rate limiting, bot protection, and common-attack shielding
- **Key surfaces:**
  - Role-scoped dashboard (charts via Recharts)
  - Chat interface for the agentic RAG assistant
  - Admin console (role/team creation, document assignment, user assignment)

---

## 7. Backend (FastAPI)

- **Framework:** FastAPI (Python), SQLModel as the ORM (shares model definitions between DB schema and API request/response validation)
- **Auth enforcement pattern:** FastAPI's `Depends()` chain plays the same role oRPC-style middleware would — every protected route declares a dependency that verifies the JWT and resolves the caller's identity and scope before the route body runs:

```python
async def get_current_user(token: str = Depends(oauth2_scheme)) -> ScopedUser:
    payload = decode_jwt(token)
    return await resolve_scope(payload["sub"])  # Redis-cached, DB-backed

@router.post("/chat")
async def chat(query: ChatRequest, user: ScopedUser = Depends(get_current_user)):
    ...
```

- **Scope resolution caching:** `resolve_scope(user_id)` results are cached in Redis (short TTL, e.g. 60s) and explicitly invalidated when an admin changes a user's role or a team's membership — avoids re-walking the org hierarchy on every request while keeping staleness bounded.
- **Agent orchestration:** LangGraph (or equivalent) graph runs inside FastAPI request handling for the `/chat` endpoint (see §9).

---

## 8. Database (NeonDB — Postgres + pgvector)

Single database, two kinds of data, one enforcement point.

**Core tables (sketch):**

```
users(id, name, email, manager_id, created_at)
roles(id, name, parent_role_id, created_by_admin_id)
user_roles(user_id, role_id)              -- supports multi-role users
teams(id, name, hr_id)
team_members(team_id, user_id, position)  -- e.g. 'manager' | 'employee'
role_permissions(role_id, team_id, resource_type, access_level)
documents(id, title, team_id, owner_id, visibility_level, created_at)
document_chunks(id, document_id, team_id, content, embedding VECTOR(n))
deadlines(id, employee_id, team_id, task, due_date, status, completed_at)
audit_log(id, user_id, role_at_time, query, tools_called, chunks_retrieved,
          chunks_denied, final_answer, timestamp)
```

**Retrieval + permission filtering as one operation:**

```sql
SET hnsw.iterative_scan = 'strict_order';
SET hnsw.ef_search = 100;

SELECT id, content, embedding <=> $query_vector AS distance
FROM document_chunks
WHERE team_id = ANY($allowed_team_ids)
ORDER BY embedding <=> $query_vector
LIMIT 5;
```

- HNSW index handles approximate nearest-neighbor search at sub-linear cost.
- `iterative_scan` prevents the permission filter from starving the result set when it's highly selective against a large shared index.
- For scale, `document_chunks` should be **partitioned by `team_id`** (or use partial indexes per team) so a query only ever traverses its own team's graph — this is what keeps latency in the tens-of-ms range regardless of overall company size, rather than degrading as the corpus grows.

---

## 9. RAG / Agentic Chatbot Design

The chatbot is implemented as a graph, not a single prompt call. Rough flow:

1. **Decision node** — is this a conversational/meta question (answer directly) or a data question (needs tools)? Internal company data questions should essentially always route to tools rather than parametric knowledge or the open web — the model's own "knowledge" isn't authoritative for "what's my team's deadline status."
2. **Tool-bound LLM node** — the LLM is bound to all available tools and decides which to call, potentially chaining calls:
   - `search_documents(query, scope)` — vector search over authorized chunks only
   - `get_deadlines(scope, filters)` — structured query over authorized rows only
   - `get_team_summary(scope)` — aggregated rollup, row-level detail withheld unless authorized
   - `request_access(doc_id)` — escalation path when a user asks for something outside their scope
3. **Authorization filter (inside every tool, not the LLM's judgment)** — each tool independently resolves the caller's real scope from the database and filters before returning anything, regardless of what the LLM "decided" or what the prompt claimed. This is the actual guardrail boundary — it must hold even if the LLM is successfully prompt-injected.
4. **Relevancy grading** — retrieved chunks are graded for relevance to the query before being used.
5. **Query rewrite loop** — if relevancy fails, the query is rewritten and retried, capped at a small max iteration count (e.g., 2) to avoid infinite loops when no authorized relevant data exists.
6. **Query splitting / parallel retrieval** — if a query has multiple sub-intents (or relevancy repeatedly fails on a compound question), split into sub-queries and retrieve in parallel.
7. **Groundedness check** — before returning an answer, verify every claim traces back to a retrieved, authorized chunk. If a claim isn't grounded, it's cut or the answer is qualified.
8. **Zero-result handling** — if scope filtering leaves nothing to retrieve, the agent must say so explicitly rather than falling back to an ungrounded, hallucinated answer.
9. **Step budget** — the whole graph has a hard cap on total tool calls/iterations per query, so a pathological case can't spiral into excessive cost or latency.

---

## 10. Guardrails Strategy

Guardrails operate in layers — no single library provides the whole thing:

| Layer | Mechanism |
|---|---|
| Retrieval-time authorization | Custom — permission filter is part of every SQL/tool query itself (§8, §9) |
| Action-time authorization | Custom — every tool re-checks caller scope independently before executing |
| Content-safety / injection / PII | Guardrails AI validators (schema/Pydantic-style checks on LLM input/output) |
| Groundedness / citation check | Custom — verify answer claims map to authorized retrieved chunks |
| Transport-layer abuse | Arcjet (rate limiting, bot detection, shield) at the Next.js edge |
| Auditability | `audit_log` table — every query logs resolved scope, tools called, chunks retrieved vs. denied, final answer |

NeMo Guardrails was considered but adds a separate dialogue-flow DSL (Colang) with a real learning curve; Guardrails AI's Pydantic-style validators fit more naturally into an already-Python stack and are lighter to adopt incrementally. Simple custom checks (regex/keyword injection heuristics, citation-match verification) may cover more ground than either library for the project's core thesis, and are easier to explain and demo.

**Evaluation of guardrail effectiveness** (red-team prompt suite, precision/recall of scope filtering, % of injection attempts blocked) is deferred to a later phase — noted here as a known open item, not yet designed.

---

## 11. Dashboard

- Scoped to whatever the viewing role has created or been assigned:
  - **Employee:** their own tasks/deadlines and progress
  - **Manager:** their team's task/deadline progress, rolled up
  - **HR:** all teams under them, aggregate + drill-down (without exposing row-level detail outside their authorization)
- Same `resolve_scope()` function backs both the dashboard queries and the chatbot's tools — one scope-resolution engine, two consumption surfaces.
- Chart library: Recharts (Next.js/React-native fit, already available in the project's toolchain).

---

## 12. Admin Console

- Admin (or a delegated Permission Admin) can:
  - Create roles and teams
  - Assign users to roles/teams, with a supervising role (e.g., Manager) over a set of Employees
  - Attach documents to a team or role — e.g., ethical guidelines, SOPs, policy docs — which become the retrievable corpus scoped to that team/role
- v1 can be a functional but minimal CRUD UI — depth here is lower priority than the guardrail/agent core (see §15).

---

## 13. Scoring Model (initial)

- Each task/deadline scored **[0, 1]** based on on-time completion.
- Known open questions to resolve before building further (see §14): handling of reassigned/extended deadlines, blocked tasks, and priority-weighting so a missed low-priority task doesn't score identically to a missed critical one.
- Recommendation: surface this as a **trend over time** on the dashboard rather than a single static number, so it reads as a fair signal rather than a punitive score — worth deciding explicitly before demo, not left implicit.

---

## 14. Open Questions

- Can a user hold multiple roles simultaneously? If so, is effective access the **union** or **intersection** of those roles' permissions?
- What's the maximum practical hierarchy depth we design/test for?
- How are documents assigned at ingestion — manually by admin, or inferred/suggested?
- Priority-weighting for the deadline scoring model — needed before the score is demo-ready?
- Real-time vs. periodic (e.g., nightly) dashboard aggregation?

---

## 15. MVP Scope (recommended cut for the deadline)

**In scope for v1:**
- Fixed-but-admin-editable role hierarchy (don't need infinitely flexible nesting to prove the concept)
- Core guardrail: scoped retrieval + scoped tool execution + audit log
- Agent graph: decision → tool-bound LLM → scoped retrieval → relevancy grade → rewrite (capped) → groundedness check
- Role-scoped dashboards (basic charts)
- Minimal admin console (create team/role, assign users, upload + tag documents)
- One convincing red-team demo (prompt injection attempt fails safely, shown live)

**Defer to stretch goals:**
- Fully generalized arbitrary-depth role nesting
- Natural-language admin configuration ("set up a role via chat")
- Formal guardrail evaluation suite/metrics
- Reranking / hybrid search
- Query splitting for parallel sub-retrieval (nice-to-have on top of the rewrite loop)

---

## 16. Deployment

- **Frontend:** Vercel (Next.js)
- **Backend:** Railway or Render (FastAPI)
- **Database:** NeonDB (Postgres + pgvector)
- **Cache:** Upstash Redis (scope resolution caching)
- **Identity:** Clerk or WorkOS
- **Security/edge:** Arcjet (Next.js middleware)

---

## 17. Tech Stack Summary

| Layer | Choice |
|---|---|
| Frontend | Next.js + TypeScript |
| Transport/typing | FastAPI OpenAPI → `openapi-typescript` (not oRPC — TS-server-only, doesn't fit a Python backend) |
| Backend | FastAPI + SQLModel |
| Agent orchestration | LangGraph |
| Database | NeonDB (Postgres + pgvector) |
| Cache | Redis (Upstash) |
| Auth | Clerk or WorkOS |
| Security (edge) | Arcjet |
| Guardrails (content) | Guardrails AI + custom validators |
| Charts | Recharts |
