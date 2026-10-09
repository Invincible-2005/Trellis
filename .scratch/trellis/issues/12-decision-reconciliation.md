# 12 - Decision Reconciliation (Audit 2026-10-08)

- **Type**: `grilling`
- **Status**: `open`
- **Assignee**: Whole team (Lead decides; Backend + Frontend confirm)
- **Blocked by**: None

## Question

A cross-check of both Wayfinder maps against each other and against the code in `backend/` and `frontend/` turned up decisions that contradict each other or were never made. Each item below needs one locked answer. Once an item is decided, write it into the ticket it came from and add a one-line pointer under the map's "Decisions so far".

---

## Decisions needed

### D1. Where does `AccessScope` live inside the LangGraph run? — ✅ RESOLVED 2026-10-08
- **Conflict was:** Tickets 03 and 04 put `scope: AccessScope` inside `AgentState`. `backend/app/agent/state.py` keeps it out.
- **Decision:**
  1. **Not in `AgentState`.** That state is checkpointed to SQLite, so a scope stored there would be written to disk and reused stale.
  2. **Passed per request via LangGraph runtime context.** The graph is built with `StateGraph(AgentState, context_schema=AgentContext)` and invoked with `graph.astream(..., context=AgentContext(scope, audit_id))`. `config["configurable"]` carries only `thread_id`. We chose this over `configurable["scope"]` because it is typed, never checkpointed, and is the LangGraph 1.x mechanism for read-only run data.
  3. **`AccessScope` is a frozen dataclass** with `frozenset` fields, a read-only `permissions_by_team`, and helpers `in_team()` and `can()`, plus `org_permissions` and `can_org()` added by D9 (which replaced the earlier `can_anywhere()`).
  4. **Enforcement lives in the data-access layer.** Every query function requires `scope` and embeds it in SQL. REST endpoints and agent tools call the same functions. Tool schemas visible to the LLM contain only business arguments.
  5. **Hierarchy checks ("caller above target") are DB checks at action time**, not fields on the scope.
- **Written into:** ticket 03 §1, §1a and §6; ticket 04 (guardrails table, `AgentState`, tools); the `backend/app/agent/state.py` docstring.
- **To verify when implementing:** the exact tool-side API for runtime injection in LangGraph 1.2.11 (`ToolRuntime` parameter vs `get_runtime()`).

### D2. One endpoint for sending a chat message — ✅ RESOLVED 2026-10-08
- **Conflict was:** Ticket 08 had `POST /api/v1/chat/sessions/{session_id}/message`. Tickets 04 and 09 and frontend tickets 02 and 03 used `POST /api/v1/chat/stream`.
- **Decision (team):** **`POST /api/v1/chat/sessions/{session_id}/message`** is the single chat endpoint. It responds with an SSE stream (`text/event-stream`, events per ticket 04). `/chat/stream` is retired.
- **What follows from it:**
  - Session ownership (`session.user_id` and `org_id` match the JWT) is checked before the graph runs; on mismatch it returns 404.
  - The BFF has one proxy route: `app/api/chat/sessions/[sessionId]/message/route.ts`.
- **Default, not yet confirmed:** the frontend creates a session first (`POST /api/v1/chat/sessions`), then sends the first message, so the sidebar shows the new chat immediately. The alternative is auto-creating the session on the first message.
- **Written into:** ticket 04 (diagram), ticket 08 (endpoint table), ticket 09 (question and Blocked by), frontend ticket 01 (route table), frontend ticket 03 (Route Handler sample), `spec.md` (file tree).

### D3. Global API prefix — ✅ RESOLVED 2026-10-08
- **Conflict was:** Ticket 05 listed `/auth/me`, `/admin/roles` and `/dashboard` with no prefix. Tickets 08 and 11 and frontend ticket 03 used `/api/v1/...`.
- **Decision:** Every FastAPI route lives under **`/api/v1`** via one `APIRouter(prefix="/api/v1")`. `/health`, `/docs` and `/openapi.json` stay at the root.
- **What each part means:**
  - `/api` separates application endpoints from infrastructure (`/health`, `/docs`, `/openapi.json`).
  - `/v1` is a version label. It only matters when a breaking change must coexist with clients you can't update at the same time (mobile apps, third-party integrations).
- **Why we keep `v1` though we don't plan a `v2`:**
  - FastAPI has exactly one client, our own Next.js BFF, and both ship in the same PR.
  - Breaking changes are caught at compile time by `api:generate` plus the CI diff check (frontend ticket 03), not by versioning.
  - `v1` costs one line, matches most existing tickets and common convention, and leaves room for a future mobile or public API without renaming every URL.
  - **Treat `v1` as a fixed label. No `v2` is planned for the MVP.**
- **Two different `/api`s (don't confuse them):**
  - Next.js BFF routes `/api/...` (for example `/api/chat/sessions/[sessionId]/message`) are called by the **browser**. They have no version, because the browser always loads the latest frontend.
  - FastAPI routes `/api/v1/...` are called **only by the Next.js server**.
- **Context (team, 2026-10-08):** The REST endpoint list is **not fully decided yet**. Ticket 05's endpoints are provisional; only its schemas and contract patterns are locked.
- **Written into:** ticket 05 (all paths prefixed), ticket 03 (cache table), frontend ticket 08, both maps.

### D4. Source of truth for admin-console access — ✅ RESOLVED 2026-10-08
- **Conflict was:** The frontend middleware gated `/admin` with Clerk `org:admin`, while the backend used Trellis permissions.
- **Decision (team):** **Trellis RBAC is the only source of truth.** Clerk org roles grant nothing in Trellis.
  - **Console entry:** `scope.can_org("create_role") or scope.can_org("add_member")`. The permission must come from the user's **org-level** role (see D9).
  - **Each tab checks its own permission:**
    - Roles: `create_role`
    - Teams: `add_member` or `create_team`
    - Documents: `upload_document`
    - Strikes: `review_strike`
  - **Frontend:** `proxy.ts` checks only signed-in and active org. `(dashboard)/admin/layout.tsx` fetches effective permissions (`GET /api/v1/auth/context`) and redirects to `/dashboard` if the user isn't allowed. Navigation and tabs are shown or hidden from the same data.
  - **Backend:** every admin endpoint enforces its own permission. The frontend gate only affects what users see.
- **Follow-up — ✅ RESOLVED 2026-10-09 (Piyush): per-tab entry.** The console opens for anyone who may open at least one tab, and shows only those tabs.
  - Tabs: Roles `can_org("create_role")`; Teams `can_org("add_member") or can_org("create_team")`; Documents `can_org("upload_document")` **or `upload_document` on any team** (so a team manager can upload team documents, D23); Strikes `can_org("review_strike")`.
  - `/auth/context` returns `active_org.admin_tabs`; `can_open_admin = bool(admin_tabs)` (`app/api/v1/auth.py::_admin_tabs`).
  - **Members tab added 2026-10-09 (D25):** `can_org("add_member")`. Tab order: roles, members, teams, documents, strikes. Its role picker uses `GET /api/v1/admin/roles` (`assignable` flag).
  - `GET /api/v1/admin/roles` keeps its `create_role or add_member` gate (only Roles/Teams use it). The Documents tab's picker uses the new `GET /api/v1/documents/tag-options` instead.
  - *Superseded text:* "A role holding only `review_strike` (an HR reviewer) or only `upload_document` can't open the console to reach its tab. **Proposal:** widen entry to \"holds any admin-tab permission org-wide\". Waiting on the team."
  - Written into: frontend-scaffold ticket 06 §0, map, `plans/documents/frontend.md`.
- **Written into:** ticket 03 §1, ticket 05, frontend tickets 02 and 06, `spec.md`.

### D5. Commendation data model
- **Gap:** `give_commendation` is in the MVP (map, ticket 04 tools, ticket 05 `CommendationResponse`), but there is no `Commendation` table in ticket 02, the code, or the migrations.
- **Recommendation:** A `commendations` table that mirrors `strikes` without status or escalation: `id`, `org_id`, `team_id`, `given_by_user_id`, `given_to_user_id`, `reason`, `created_at`.

### D6. Strike appeal fields and flow
- **Gap:** The PRD §8 lists `reviewed_by_user_id` and `appeal_notes` on strikes, and frontend `/admin/strikes` is designed for appeal review. The `Strike` model has neither field, and the map lists the appeal flow as undecided.
- **Also check:** With HITL Pattern A (ticket 10), the agent validates the strike before the DB commit. Is the `pending_agent_review` status still needed?

### D7. Chat LLM provider — ✅ RESOLVED 2026-10-09
- **Decision (Piyush): Gemini Flash on Google's free tier** via the already-installed `langchain-google-genai`.
  - Two settings: `CHAT_MODEL` (read + write agents) and `ROUTER_MODEL` (Flash-Lite, higher free limits). Key in `GOOGLE_API_KEY`. Models are created with LangChain `init_chat_model`, so switching provider later is a settings change.
  - **Checked by Piyush in AI Studio (2026-10-09): Flash-Lite free tier ≈ 15 RPM, 250k TPM, 500–1,000 RPD.** Enough for development (the router makes one call per message).
  - Free-tier limits are unclear and have been cut before (third-party guides: ~10–15 RPM, ~20–1,500 requests/day). Check the real quota in AI Studio; if the daily cap is too tight, top up for demo day or switch provider via settings.
  - The lean graph (D19) keeps a message to 2–4 calls, which is what makes the free tier realistic.
  - Query-time embedding still follows D14 (must match ingestion).
  - **Unused packages:** `tavily-python` and `deepeval` removed 2026-10-09 (`uv remove` + `requirements.txt`). `ollama` kept pending D14.
- *Original gap text below.*
- **Gap:** No ticket picks the chat or router model. `requirements.txt` includes `langchain-google-genai`, `ollama`, `tavily-python` and `deepeval`, and none of them are justified in any ticket. Guardrails AI (ticket 10) is not installed.
- **To decide:**
  - The provider and model for the Router (fast, structured output).
  - The provider and model for ReAct and synthesis.
  - The embedding call used at query time. It must be the same `mxbai-embed-large-v1` that ingestion uses.
  - Which unused dependencies to remove.

### D8. Clerk org ID → internal org ID, and header trust — ✅ RESOLVED 2026-10-08
- **Principle:** **Clerk proves identity and membership; Trellis decides permissions.**
  - Who you are, which Clerk orgs you belong to, and your active org come from the **verified JWT only**.
  - Roles, teams and permissions come from the **Trellis DB**.
- **Request pipeline (FastAPI dependencies):**
  1. **`verify_clerk_jwt` → `ClerkClaims(clerk_user_id, clerk_org_id?, clerk_org_role?, email, name)`.**
     - Verified with `PyJWKClient`, RS256 only.
     - `exp`, `nbf` and `sub` are required; leeway is at most 5 seconds.
     - `iss` must equal `CLERK_ISSUER`, and `azp` must be in `CLERK_AUTHORIZED_PARTIES`.
     - The org is read from v2 `o.id` / `o.rol`, falling back to v1 `org_id` / `org_role`. **Confirm by decoding a real dev token.**
     - `email` and `name` come from **custom session-token claims** configured in the Clerk dashboard.
  2. **`get_identity`:** just-in-time upsert of `users` by `clerk_user_id`. Returns `Identity(user_id, email)`.
  3. **`get_org_context`:**
     - No org claim → 400 `no_active_org`.
     - Maps `organizations.clerk_org_id` → `organizations.id` (cached). Unknown org → **409 `org_not_provisioned`**.
     - Makes sure the `org_members` row exists. Creating it is safe because the token proves Clerk membership.
     - Applies pending invitations (D10-B).
  4. **`get_scope`:** `resolve_scope(user_id, org_id)`.
- **Headers:** the BFF **stops sending** `X-Org-Id`, `X-User-Id` and `X-Org-Role`, and FastAPI ignores any such header.
- **Status codes:** 401 for a bad or missing token, 403 when authenticated but not allowed, 409 when the org isn't provisioned.
- **Identity-only endpoints:** `/auth/me`, `/auth/context` and `/orgs/provision` use `get_identity` and skip the org checks.
- **New settings:** `CLERK_ISSUER`, `CLERK_JWKS_URL`, `CLERK_AUTHORIZED_PARTIES`, `CLERK_SECRET_KEY` (for the Backend API).
- **Written into:** ticket 03 §2 and §5, frontend tickets 03 and 04.

### D9. Users who are in no team — ✅ RESOLVED 2026-10-08
- **Decision:** Add an **org-level role**. `org_members.role_id` (FK to roles, nullable) holds the user's org-wide role, alongside their per-team roles in `team_members`.
- **`AccessScope` changes:**
  - It gains `org_permissions: frozenset[str]`.
  - `visible_role_ids` starts from the org role plus all team roles, then walks down the tree.
  - `can(p, team)` = `p` is in `org_permissions` **or** in `permissions_by_team[team]`. An org role applies in every team.
  - New `can_org(p)` checks org-wide permissions only. It **replaces `can_anywhere`**.
- **Org-wide permissions** (checked with `can_org`): `create_role`, `create_team`, `add_member` (invite into the org), `view_aggregate`, `review_strike`, and `upload_document` for `org`- or `role`-scoped documents.
- **Team permissions** (checked with `can(p, team)`): `assign_task`, `give_strike`, `add_member` (an existing org member into that team), and `upload_document` for `team`-scoped documents.
- **Root Admin role (decision, team):** each new org is seeded with **one** protected role, `Admin` (`roles.is_system = true`), holding all 8 permissions and assigned to the creator at org level.
  - It can't be deleted or re-parented, and its permissions can't be reduced.
  - At least one user must always hold it.
- **No privilege escalation (guardrail):**
  - A user can only create, edit, assign or remove roles and members **strictly below their own highest role**.
  - A user can only grant permissions they hold themselves.
  - Without this rule, a `create_role` holder could create a super-role and assign it to themselves.
- **Written into:** ticket 02 (schema), ticket 03 §1 and §3, ticket 05.

### D10. Org onboarding and Clerk ↔ database sync — ✅ RESOLVED 2026-10-08
- **Decision (team):** **Any signed-up user can create an org** and becomes its Admin.
- **The Trellis backend is the only writer of memberships.** It calls the Clerk Backend API first, then writes the DB. Clerk's own member-management UI isn't exposed in the app.
- **No webhooks in the MVP.** Clerk's own guidance is not to rely on webhooks in synchronous flows like onboarding (`frontend/.agents/skills/clerk-webhooks/SKILL.md`).
- **A. Creating an org**
  1. `/org-selection` → `<OrganizationList hidePersonal afterCreateOrganizationUrl="/onboarding" />`. Clerk creates the org; the creator is `org:admin` and the org is active.
  2. The `/onboarding` server page → BFF → **`POST /api/v1/orgs/provision`** (idempotent):
     - The Clerk org ID comes **from the token, never the request body**, and the caller's Clerk org role must be `org:admin`.
     - The name is fetched from the Clerk Backend API (`GET /v1/organizations/{id}`).
     - **One transaction** inserts the `organizations` row, the `Admin` root role, and `org_members(creator, role=Admin)`.
  3. Redirect to `/dashboard`.
  - **Safety net:** any 409 `org_not_provisioned` sends the user to `/onboarding`. A non-admin caller gets 403 "workspace not set up yet".
- **B. Inviting someone**
  - Requires `can_org("add_member")`, and the assigned role must be below the inviter's.
  - `POST /api/v1/admin/teams/{team_id}/members {email, role_id}`:
    - **Already an org member:** insert `team_members` and invalidate their scope.
    - **Not a member yet:** insert a pending Trellis `invitations` row (team and role, the source of truth for **what** they get), then Clerk `POST /v1/organizations/{id}/invitations` (role `org:member`; Clerk only **delivers** it), then store `invitations.clerk_invitation_id`.
  - On the invitee's first request in that org, `get_org_context` creates their `org_members` row, converts every pending invitation for (verified email, org) into `team_members`, and marks it `accepted`.
  - The explicit `POST /invitations/{id}/accept` (ticket 05) is **dropped**.
  - Revoking an invitation revokes it in Clerk too.
- **C. Removing someone**
  - `DELETE /api/v1/admin/members/{user_id}`: delete the Clerk membership (Backend API), then the `team_members` and `org_members` rows, then `invalidate_scope`.
  - Refused for a target at or above the caller's role, and for the last Admin.
- **Webhooks deferred to v2** as drift repair (`organizationMembership.deleted`, `organization.deleted`, `user.updated`, `user.deleted`). In the MVP, a user removed directly in the Clerk dashboard already loses access, because their token no longer carries the org; only stale rows remain.
- **Implementation:** ticket 13.

### D11. Deployment realities vs current design (added 2026-10-08)
- **Gap:** PRD §17 says the backend runs on Railway or Render and the cache is Upstash Redis. Several MVP choices assume one long-lived process with a local disk:
  1. **The SQLite `checkpoints.db`** is lost on every redeploy unless the host has a persistent volume. Options: attach a volume, or use `AsyncPostgresSaver` (NeonDB) from the first deploy. Ticket 08 says that's a one-line swap.
  2. **The in-process `TTLCache`** (ticket 03) is only correct with **one** backend instance. The PRD's mention of Redis is stale (ticket 03 replaced it). Lock "single instance for MVP".
  3. **FastAPI `BackgroundTasks` ingestion** (ticket 11) is killed by a restart, leaving documents stuck in `processing` forever. A recovery rule is needed, for example on startup mark documents stuck longer than N minutes as `failed`, or re-queue them.
- **Recommendation:** Run a single instance for the MVP and use the Postgres checkpointer in any deployed environment (SQLite for local dev only). Add a startup sweep for stuck `processing` documents.

### D12. Single-org or multi-org for v1? (added 2026-10-08)
- **Conflict:** The map's "Out of scope" says "Multi-tenant SaaS billing (v1 = single org workspace)". Everything else is built for **multiple orgs per user**: the `org_members` bridge table, `org_id` on every row, Clerk Organizations, `/org-selection`, and `thread_id = {org_id}:...`.
- **Likely intent:** "Billing is out of scope", not "only one org exists". If so, reword that line to "no billing; multi-org supported, each org isolated by `org_id`". Confirm.

### D13. Which teams can a user above a team see? (added 2026-10-08, found while writing D9)
- **Gap:** In ticket 03, `allowed_team_ids` contains only teams the user is a **member** of. The access rule in ticket 02 and the PRD says team-scoped documents are visible to members **and all roles hierarchically above the team**.
  - Today an HR or org-level Admin who isn't on a team can't see its tasks or its team-scoped documents, and fails `scope.in_team(team_id)` on every team endpoint.
  - This got more visible with D9, because the org creator's Admin role is org-level and belongs to no team.
- **Proposal:**
  - Split the field into `member_team_ids` (teams I'm in) and `governed_team_ids` (teams containing at least one member whose team role is in my `visible_role_ids`, i.e. at or below me).
  - Read access (tasks, team docs, dashboards) uses the union of the two.
  - Write actions keep using `can(p, team)`.
  - An org-level root Admin then governs every team that has members.
  - **Edge case:** a team with zero members is visible only to `can_org("create_team")` holders, through the admin console.
- **To decide:** whether "above the team" means "above at least one member" (the proposal) or something else, such as a team's own `owner_role_id`.
- ✅ **RESOLVED 2026-10-08 (Piyush): "above the team" means "above *every* member".** The "at least one member" wording above is superseded. Under it, a manager would govern a peer manager's team just because that team has employees.
  - `governed_team_ids` = teams that have at least one member, where **every** member's team role is **strictly below** at least one of the user's roles (team roles and the org-level role are both seeds; "strictly below" excludes the seed role itself).
  - `member_team_ids` = teams the user is on.
  - **Read access** (team tasks, team-scoped docs, team dashboards) = members plus governed teams, through `can_view_team(team_id)`. The RAG filter for `scope_type='team'` uses that union too.
  - **Write actions** are unchanged: `can(p, team)` (org role OR the user's team role in that team), plus the no-escalation guards.
  - **Examples:**
    - Org Admin → every team with members.
    - HR → every team led by managers or below.
    - A manager → their own team only, not a peer manager's team.
  - An empty team is visible only to `can_org("create_team")` holders (admin console).
  - Role-scoped docs are unaffected: they stay visible to the role and its ancestors.
  - **Written into:** ticket 03 (fields and §gaps), ticket 13 step 3, and the map.

### D14. Embedding provider and cost (added 2026-10-08, found during the ingestion smoke test) — ✅ RESOLVED 2026-10-09
- **Decision (Piyush): Gemini embeddings, `gemini-embedding-001`, `outputDimensionality = 1024`.**
  - Same Google key and free account as the chat LLM (D7). Free tier reported at ~100 RPM / ~1,000 RPD (Google forum figures; confirm in AI Studio). One `batchEmbedContents` request embeds a whole batch of chunks.
  - **No migration:** `document_chunks.embedding` stays `Vector(1024)`. **No re-embedding:** nothing was ever embedded (the HF call returned 402 and the documents endpoint isn't built).
  - Google's `taskType` replaces mxbai's query prefix: chunks use `RETRIEVAL_DOCUMENT`, questions (`search_documents`) use `RETRIEVAL_QUERY`. The query side must use the same model and dimension.
  - Cosine distance (`<=>`) is unaffected by Gemini's non-normalized 1024-dim output.
  - Free-tier note: Google may use free-tier inputs to improve its products. Fine for demo documents.
  - Why not the others: HF credits and Mixedbread cost money; local mxbai via Ollama needs Ollama on every laptop and ~1.3 GB extra RAM on the server. (`mxbai` the model is free; HF's hosted inference is what stopped being free.)
  - **Built 2026-10-09:** `app/services/embeddings.py` (`embed_documents`, `embed_query`); ingestion uses it; config switched (`HUGGINGFACE_TOKEN` removed); `ollama` removed. Live call verified 1024-dim vectors.
  - **Written into:** ticket 11, map, `app/models/document.py` comment.
- *Original gap text below.*
- **Gap:** Ticket 11 assumed the HuggingFace Inference API is a free tier. A live call with the team's token returned **`402 "You have no remaining credits. Purchase pre-paid credits … or subscribe to PRO"`**. HF Inference Providers now bill against small monthly credits, so **document ingestion cannot embed anything right now.**
- **Constraint:** `document_chunks.embedding` is `Vector(1024)`. Any replacement must produce 1024-dim vectors, or else needs a migration and re-embedding of everything.
- **Options:**
  - (a) **HF PRO or prepaid credits.** No code change; the cost scales with documents and queries.
  - (b) **Run mxbai locally** (sentence-transformers, or a HuggingFace TEI container next to the backend). Free per call and the same model and vectors, but it uses about 1.3 GB RAM and conflicts with the original "save backend RAM" goal.
  - (c) **Another hosted provider** offering 1024-dim output. This changes the model, so the query prefix and any already-stored vectors change too.
- **Code impact is small either way:** `EMBEDDING_API_URL`, `EMBEDDING_MODEL` and `EMBEDDING_DIM` are settings. The query side (`search_documents`) must use the **same** provider and model as ingestion.

### D15. Map conflict: "Org provisioning flow — decided 2026-09-28" (PR #8) vs D10 and D4 (added 2026-10-08) — ✅ RESOLVED 2026-10-08
- **Decision (Piyush): keep D10 and D4.**
  - An org is created explicitly by `POST /api/v1/orgs/provision`, called from `/onboarding` right after Clerk org creation. That page is a brief pass-through on the way to `/dashboard`.
  - Members and roles are managed by anyone holding `add_member` or `create_role` org-wide, with no privilege escalation, not "only the creator".
  - The 2026-09-28 map entry is marked superseded.
  - Reasons:
    - The PR #8 text contradicts itself ("mirror on first JWT hit" vs "does NOT auto-create").
    - Creating the org implicitly can't seed the protected Admin role in one transaction.
    - "Only the creator" breaks when the creator leaves or hands off.
- **Conflict:** PR #8 (`resolved-scope`) added two decisions to the map, dated 2026-09-28 but merged after D4 and D10:
  1. **Provisioning:** "backend mirrors [the Clerk org] into `organizations` on first JWT hit", yet also "Backend does NOT auto-create org rows". The text contradicts itself. D10 decided an explicit, idempotent `POST /api/v1/orgs/provision` called from `/onboarding`, with the root Admin role seeded in the same transaction.
  2. **Member management:** "Only the org creator (admin) can add/remove members and assign roles." D4 and D9 decided that any holder of `add_member` or `create_role` (org-level, no privilege escalation) may do so.
- **Code today (`app/core/deps.py`) implements neither.** An unknown org returns an empty scope (sentinel `org_id = UUID(int=0)`) instead of mirroring the org or returning 409 `org_not_provisioned`.
- **To decide (the team, including the PR #8 author):** keep D10/D4 and mark the 2026-09-28 lines superseded, or reopen D10/D4. Until then, ticket 13 follows D10/D4.

### D16. Error response shape for machine-readable codes (added 2026-10-08, found while starting ticket 13 step A) — ✅ RESOLVED 2026-10-08
- **Decision:** the proposal below, plus Piyush's rule for the UI: **failures are shown to the user as a sonner toast with `detail.message`**. The exceptions are redirect codes (`invalid_token` → sign-in, `no_active_org` → `/org-selection`, `org_not_provisioned` → `/onboarding`), which redirect instead of toasting. Step A added `email_in_use` (409), for an email already linked to a different Clerk user.
- **Written into:** ticket 05 (endpoint errors), `backend/app/core/errors.py`, and the map.

- **Gap:** Tickets 03, 05, 12 and 13 name error codes the BFF must branch on: `400 no_active_org` → `/org-selection` and `409 org_not_provisioned` → `/onboarding`. Step A adds `400 email_required` and `503` for Clerk being unreachable. **No ticket says where the code goes in the response body.** FastAPI's default is `{"detail": "<string>"}`, which has no stable code to branch on.
- **Proposal:** Every error Trellis raises returns `{"detail": {"code": "<snake_case>", "message": "<human text>"}}`, through one small helper (e.g. `api_error(status, code, message)` in `app/core/errors.py`).
  - Keeping the `detail` key means FastAPI's own errors still have a familiar shape. Request-validation errors (422) keep FastAPI's default list shape.
  - The BFF branches on `status` + `detail.code`, never on the message text.
  - The codes are listed in ticket 05 and show up in the OpenAPI spec through `responses=`.
- **Initial codes:**
  - `invalid_token` (401)
  - `auth_unavailable` (503, Clerk keys or Backend API unreachable)
  - `email_required` (400)
  - `no_active_org` (400)
  - `org_not_provisioned` (409)
  - `forbidden` (403)

### D17. Role creation: who counts as "the caller's role"? (added 2026-10-09) — ✅ RESOLVED 2026-10-09
- **Gap:** Ticket 05 says a new or edited role "must sit below the caller's role" and the caller "may only grant permissions they hold", but a user can hold an org-level role plus a different role in each team. Which one is the yardstick?
- **Decision (Piyush):** the caller's **org-level role only**. Role endpoints require `can_org("create_role")`, which already looks only at the org-level role, so the yardstick matches the gate. Team roles never count.
- **Rules for `POST/PATCH/DELETE /api/v1/admin/roles`:**
  1. Caller needs `can_org("create_role")`.
  2. The new/edited role's parent must be the caller's org role or one of its descendants (strictly below the caller). No parent-less roles; only the seeded `Admin` is a root.
  3. Permissions granted must be a subset of `scope.org_permissions` and from the 8 known actions.
  4. Name unique within the org (409).
  5. Edit/re-parent: the role itself must already be strictly below the caller, the new parent too, and no loop (not under its own descendant). Every role write (create, edit, move, delete) calls `invalidate_org`. *(Corrected 2026-10-09: the earlier "create needs no invalidation" was wrong. Roles above the new one must see documents tagged to it, so their cached `visible_role_ids` go stale.)*
  - Only **added** permissions must be ones the caller holds; removing is always allowed, so editing a role never fails over permissions someone higher gave it.
  6. `is_system` roles can't be edited, moved or deleted.
  7. Delete is refused (409) if anyone holds the role or it has child roles.
- **Where the code goes:** router `api/v1/admin.py`, schemas `schemas/admin.py`, checks and logic in `services/roles.py` (replaces the "suggested `guards.py`" in ticket 13 step 3, per `backend/CLAUDE.md`).

### D18. How browser forms send changes to the backend (added 2026-10-09, found while connecting role creation) — ✅ RESOLVED 2026-10-09
- **Gap:** the frontend only had a read pattern (`lib/api/queries/`, used by Server Components). The first write from a browser form ("New role" dialog) had no decided path; the frontend map listed form handling as "not yet specified".
- **Decision (Piyush): Next.js Server Actions.**
  - Writes live in `frontend/lib/api/actions/<area>.ts` with `'use server'`, next to `queries/`. They call the existing `api` client (Bearer token only, D8), so the browser still never reaches FastAPI (D3).
  - **Expected errors are returned, not thrown:** an action returns `{ ok: true, data }` or `{ ok: false, message }`, and the dialog shows `message` in a sonner toast (D16). Thrown errors have their message hidden by Next.js in production. Redirect codes (`invalid_token`, `no_active_org`, `org_not_provisioned`) still redirect.
  - On success the action calls `revalidatePath(...)` for the page it changed.
  - Route Handlers stay only for streaming (the chat SSE proxy).
- **Written into:** frontend-scaffold map, ticket 03 ("As built"), `spec.md`, `frontend/CLAUDE.md`.

### D19. Agent graph shape: fewer LLM calls per message (added 2026-10-09, agent design review) — ✅ RESOLVED 2026-10-09
- **Gap:** ticket 10 runs about 6–8 LLM calls per message (input guardrail, 3-way router, ReAct calls, relevancy grader, synthesis, LLM groundedness grader, output guardrail). Free LLM tiers allow roughly 10–15 requests a minute, so two users chatting at once hit the limit.
- **Bug in ticket 10:** the relevancy grader runs after *every* retrieve, including `get_tasks` / `get_team_summary`. An empty task list ("Do I have overdue tasks?" → none) is graded "not relevant", rewritten twice, then refused, instead of answering "You have no overdue tasks."
- **Decision (Piyush): lean graph.**
  1. **Router is 2-way: `read` | `write`.** No `conversational` route: small talk goes to the read agent, which may answer without calling a tool. This removes the risk of a workspace question being misrouted to "conversational" and answered from general knowledge. Write tools are still bound only on the `write` route.
  2. **Relevancy grader + query rewrite (max 2) run only after `search_documents`.** Task and summary lookups are answered as-is; empty is a valid answer.
  3. **The read agent's final message is the answer** (no separate synthesis LLM call).
  4. **Groundedness is checked in code:** the answer cites chunk numbers; code checks every cited chunk ID is in this turn's `retrieved_chunk_ids`. No extra LLM call.
- **Result:** typical message = 2–4 LLM calls. All security guarantees are unchanged (they live in tools + `AccessScope`).
- **Implementation rules written with this decision (no decision needed, bugs to avoid):**
  - Per-turn fields (`step_count`, `rewrite_count`, `retrieved_chunks`, `retrieved_chunk_ids`, `groundedness_passed`, `intent`) are **reset in the input of every invocation**. They are checkpointed, so otherwise message 2 starts at step 8/8.
  - The LLM sees a **trimmed history** (last ~10 turns, old tool outputs dropped); the full history stays in the checkpoint.
- **Written into:** ticket 10 (§0 update), map.

### D20. Streaming vs after-the-answer checks (added 2026-10-09, agent design review) — ✅ RESOLVED 2026-10-09
- **Conflict:** ticket 04/09 stream `token` events live, but ticket 10 runs the groundedness check and a Guardrails AI output filter *after* the answer is finished, so anything they would cut has already been shown.
- **Decision (Piyush): stream live, then fix up citations.**
  - `token` events stream as the read agent writes.
  - After the answer ends, the code citation check (D19) runs. The `citations` event carries **only** citations whose chunk ID was retrieved this turn. If any were dropped, the backend appends a short note ("1 source couldn't be verified") before `done`.
  - **The output guardrail (Guardrails AI on the answer) is removed.** Reason: the LLM only ever receives data inside the caller's `AccessScope`, so the stream cannot leak out-of-scope data; a bad citation is a quality issue, not a leak. An output PII filter would also strip the employee names the user asked about.
- **Written into:** ticket 10 (§0 update), ticket 09 (header note), map.

### D21. Input check before the LLM (added 2026-10-09, agent design review) — ✅ RESOLVED 2026-10-09
- **Gap:** ticket 10 Node 1 runs Guardrails AI on every message and rejects (400) on suspected injection **or PII**. Names and emails are normal input here (strikes, tasks, HR questions), so the PII check blocks core use cases. Injection blocking adds little: scope is enforced at the tools, so an injection cannot reach out-of-scope data. Guardrails AI is not installed and is heavy (hub validators, NLP models).
- **Decision (Piyush): flag and log, don't block; no PII check.**
  - **No PII check on input.**
  - **Home-made injection heuristic:** a short list (~10) of obvious phrases ("ignore previous instructions", "you are now", "system prompt", …), case-insensitive. A match **never blocks**; the turn's audit entry gets `injection_suspected = true` and the message continues. *(PRD `audit_log` has no such column yet; add `injection_suspected BOOL DEFAULT false` when the audit table is migrated.)*
  - **Length limit:** messages over ~4,000 characters are rejected before streaming starts with `400 message_too_long` (D16 error shape → toast). Protects the free LLM quota.
  - **Guardrails AI is dropped from the plan.** PRD §10's "Guardrails AI validators on LLM input/output" row is superseded by D20 + D21.
- **Demo value:** an injection attempt goes through, gets "I couldn't find that in the documents you can access", and the audit log shows it was flagged and reached 0 restricted chunks — proof that the structural guardrail holds.
- **Written into:** ticket 10 (§0 update), map.

### D22. Confirming actions the agent takes (added 2026-10-09, agent design review) — ✅ RESOLVED 2026-10-09
- **Gap:** ticket 10's "HITL Pattern A (conversational confirmation)" keeps no record of the pending action (the user's "yes" is a new message that goes back through the router), and whether the agent asks at all is a prompt rule. A document containing hidden instructions could trigger a write with no hard stop.
- **Decision (Piyush): the graph pauses and the user clicks Confirm or Cancel, for all three write tools** (`create_task`, `give_strike`, `give_commendation`).
  1. The write node prepares the action and stores it in state as `pending_action` (tool, args, display summary, policy check result for strikes). Nothing is written yet.
  2. The graph pauses with LangGraph `interrupt()` (needs the checkpointer, which we have).
  3. SSE emits a new **`confirm`** event `{"action": "give_strike", "summary": "...", "policy": {...}}`, then `done`. The frontend shows a card with **Confirm** / **Cancel**.
  4. The click is sent to the **same** endpoint, `POST /api/v1/chat/sessions/{session_id}/message`, with body `{"resume": "confirm" | "cancel"}` instead of `{"message": ...}` (keeps D2's single chat endpoint). The backend resumes with `Command(resume=...)`.
  5. On confirm, the tool **re-checks permissions with the fresh `AccessScope`** of the resume request, then writes exactly `pending_action`. On cancel, nothing is written and the agent says so.
  6. A new normal message while an action is pending cancels it.
- **Result:** nothing is written without a human click on exactly what was shown; a prompt-injected document can at most produce a card the user cancels.
- **Written into:** ticket 10 (§0 update), ticket 09 (`confirm` event + resume body), ticket 04 (SSE table), frontend-scaffold/07 (header note), map.

### D23. Where may a document be tagged? (added 2026-10-09, documents effort slice C) — ✅ RESOLVED 2026-10-09
- **Gap:** ticket 03 says who may upload (`can_org("upload_document")` for org/role docs, `can("upload_document", team)` for team docs) but not *which* role or team a document may be tagged to. An HR user could tag a document to `Admin` (then can't see her own upload) or to a peer role like `Finance` (pushing content the agent will quote to Finance as policy).
- **Decision (Piyush): "at or below yourself".**
  - **Org docs:** `can_org("upload_document")`.
  - **Role docs:** `can_org("upload_document")` **and** `role_id` is the caller's org-level role or a role below it (`role_id == scope.org_role_id or scope.can_manage_role(role_id)`), same yardstick as D17. Else 403 `forbidden`: "You can only tag documents to your own role or roles below it."
  - **Team docs:** `can("upload_document", team_id)` **and** `can_view_team(team_id)` (member or governed, D13). Else 403 `forbidden`.
  - Role or team from another org → 404 (`role_not_found` / `team_not_found`), like a missing one.
- **Result:** uploaders always see what they uploaded and can't place documents above or beside themselves.
- **Delete (Piyush, same day): "if you could upload it there, you can delete it".** `DELETE /api/v1/documents/{id}` applies the same check to the document's current tag. A document the caller can't see → 404 `document_not_found`. Chunks are removed with it (cascade). This covers uploaders who leave or change roles.
- **Written into:** ticket 03 (permission table note), map, `plans/documents/backend.md` slice C.

### Small agent gaps written in directly (2026-10-09, agent design review, no decision needed)
- `give_strike` / `give_commendation` take `team_id` as well as `to_user_id` (a person can be on two teams; the hierarchy check is per team). Filled from the `@team` mention or asked for by the agent.
- Each graph step gets an SSE `status` name, defined in ticket 09: `checking_input`, `routing`, `searching_documents`, `looking_up_tasks`, `grading_relevance`, `rewriting_query`, `preparing_action`, `writing_answer`, `verifying_citations`.
- Task/summary tool results are not "chunks": they go to the agent as tool messages and are never put in `retrieved_chunk_ids` or cited.

### D24. Who sees a team's summary, and its strike count? (added 2026-10-09, agent slice 1) — ✅ RESOLVED 2026-10-09
- **Decision (Piyush): the proposal below.** Summary = every team the user can view, with task counts; `active_strikes` only where `can("give_strike", team) or can("review_strike", team)`, otherwise `null`. "Active" = any status except `dismissed`. Applies to chat and the dashboard (same function). Implemented in `app/services/tasks.py::team_summary`.
- *Original gap text below.*
- **Gap:** `team_summary(db, scope)` (ticket 03 §1a) backs both the agent's `get_team_summary` tool and the dashboard's `managed_teams` (ticket 05 `TeamOverview`: member count, task counts, `active_strikes`). No ticket says which teams appear, or who may see the strike count. Under D13, a manager's **own** team is a member team, not a governed one, so "managed teams = governed teams" would hide it from them.
- **Proposal:** the summary covers every team the user can view (`viewable_team_ids`). Task counts are always included (the user can already list those tasks). `active_strikes` is included only where the user can give or review strikes in that team (`can("give_strike", team) or can("review_strike", team)`); otherwise it is omitted.
- **To decide:** the strike-count rule.

### D25. Where do people get added to the org: a Members page or the Teams tab? (added 2026-10-09, member-management effort) — ✅ RESOLVED 2026-10-09
- **Decision (Piyush): Members page.** `/admin/members` lists org members + pending invites and invites into the **org** with an optional org-level role (`can_org("add_member")`, role strictly below the inviter's org role, D17 yardstick). The Teams tab only puts existing org members into teams (`can("add_member", team)`). `invitations.team_id` becomes nullable (migration); an invite's `role_id` is the org role. Supersedes the team-first invite in D10-B / ticket 05 §3.
- *Original gap text below.*
- **Gap:** D10-B and ticket 05 §3 put "add a person" inside a team: `POST /api/v1/admin/teams/{team_id}/members {email, role_id}`, and `invitations.team_id` is `NOT NULL`. Piyush wants an org-level `/admin/members` page (list of org members + "Invite member") that the frontend spec doesn't have. No team endpoints exist yet, so a team-only invite would block adding anyone.
- **Proposal:** `/admin/members` invites into the **org** with an optional **org-level role** (below the inviter's, D17 yardstick, `can_org("add_member")`). Putting existing org members into teams stays in the Teams tab (`can("add_member", team)`). `invitations.team_id` becomes nullable; the invite's `role_id` is then the org role.
- **Next question after this:** what "already exists" means for the direct-add path (has a Trellis/Clerk account vs already in this org), and whether direct add skips the invitee's consent.

### D26. Inviting someone who already has an account (added 2026-10-09, member-management effort) — ✅ RESOLVED 2026-10-09
- **Gap:** Piyush wants two paths (existing user → added directly; new user → invite email). D10-B only says "already an org member → add to team, otherwise invite"; it doesn't define "already exists" for the org itself.
- **Decision (Piyush): add directly.** `POST /api/v1/admin/members {email, role_id?}`:
  - Email found in Trellis `users` (has signed in before) → Clerk `POST /v1/organizations/{id}/memberships` (`org:member`), then insert `org_members` with the role, then `invalidate_scope`. Response `status: "added"`. No accept step.
  - Not found → pending `invitations` row (org role, `team_id` null), then Clerk org invitation, then store `clerk_invitation_id`. Response `status: "invited"`. Applied on the invitee's first request (D10-B).
  - Already an org member → 409 `already_member`; pending invite for that email → 409 `already_invited`.
  - Someone with a Clerk account who never opened Trellis falls into the invite path, which still works.

---

## Already fixed in docs during the audit (no decision needed)
- D3: all FastAPI paths in ticket 05 now carry the `/api/v1` prefix.
- Ticket 02: the wording for `scope_type='role'` visibility was inverted. It now says "role + ancestors"; the CTE was already correct.
- Ticket 02: `review_strike` was added to the permission comment.
- Ticket 03: added the cache-invalidation row for role re-parenting.
- Ticket 04: marked as superseded by ticket 10 for topology.
- Ticket 05: the document schemas now match ticket 11 (`org` scope, `file_type`, `status`, `chunk_count`), and the codegen path now points to frontend ticket 03.
- Ticket 06: resolved through frontend ticket 06.
- Ticket 11: `user_ancestor_roles` was renamed to `visible_roles`.
- Frontend map, frontend tickets 01, 02 and 06, and `spec.md`: updated for the real route groups (`(marketing)/(auth)/(dashboard)`), Next 16 `proxy.ts`, Clerk v7, and `org` scope tagging.

## Code drift found (needs a `backend/` change, which requires separate confirmation per AGENTS.md)
- ~~`backend/app/core/config.py`: no LLM settings.~~ Fixed 2026-10-09: `GOOGLE_API_KEY`, `CHAT_MODEL` (`google_genai:gemini-flash-latest`), `ROUTER_MODEL` (`google_genai:gemini-flash-lite-latest`), `CHAT_MAX_MESSAGE_CHARS=4000` (D7, D21).
- ~~`backend/app/agent/state.py`: old 3-way `intent`, LLM groundedness field, no `pending_action`, no per-turn reset.~~ Fixed 2026-10-09: rewritten for D19–D22; adds `AgentContext` and `new_turn_input()`.
- ~~`backend/app/models/document.py` docstring: the same inverted "descendant" wording as ticket 02.~~ Fixed 2026-10-08.
- ~~`backend/app/models/role.py` permission comment: missing `review_strike`.~~ Fixed 2026-10-08 (migration `d4e8b2a61f07` commit).
- ~~`backend/app/core/config.py` `async_migrations_url` and `alembic/env.py`: both use the **pooled** URL.~~ Fixed 2026-10-08: `async_migrations_url` now always uses the direct `DATABASE_URL`.
- Migrations: **document search indexes added 2026-10-09** (`a7c2e9f4b310`: `CREATE EXTENSION IF NOT EXISTS vector`, HNSW `vector_cosine_ops`, chunk scope indexes, `documents (org_id, created_at)`); task, comment, chat-session and audit indexes still come with those features. Earlier: **partly fixed 2026-10-08.** `d4e8b2a61f07` adds `idx_org_members_role`, `idx_invitations_pending`, `idx_team_members_user` and `idx_roles_org_parent`. Still missing: the remaining ticket 02 indexes (HNSW `vector_cosine_ops`, chunk scope indexes, tasks, comments, chat sessions, audit), planned as ticket 11's indexes migration. There is also no `CREATE EXTENSION IF NOT EXISTS vector`.
- ~~`backend/app/services/ingestion.py`: no retry, no failure reason, reuses the request's session.~~ **Fixed 2026-10-08.** The rework also covers the SSRF guard, the atomic commit, extraction off the event loop, and the stale-job sweep (see ticket 11 §7a). ⚠️ Migration `c3f1a9d27e54` must be applied.
- Scope cache: no invalidation on re-parenting yet (nothing is implemented yet).
- Repo hygiene:
  - ~~`backend/**/__pycache__/*.pyc` files are tracked in git.~~ Fixed 2026-10-08: they are untracked, and `backend/.gitignore` is corrected (its paths were prefixed with `backend/`, so nothing matched).
  - The frontend has both `package-lock.json` and `pnpm-lock.yaml`; `packageManager` is pnpm.
- The PRD still says the scope cache is "Redis, TTL ~60s". Ticket 03 replaced that with an in-process `TTLCache` with a 5-minute TTL.
