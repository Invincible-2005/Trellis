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
- ~~**Default, not yet confirmed:** the frontend creates a session first (`POST /api/v1/chat/sessions`), then sends the first message, so the sidebar shows the new chat immediately. The alternative is auto-creating the session on the first message.~~ Confirmed 2026-10-12 by D42: create, then send, both at the moment the first message is sent; "New chat" itself creates nothing.
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
  - Tabs: Roles `can_org("create_role")`; Teams `can_org("add_member") or can_org("create_team")`; Documents `can_org("upload_document")` **or `upload_document` on any team** (so a team manager can upload team documents, D23); Strikes `can_org("review_strike")` *(widened 2026-10-10 by D6: or `review_strike` on any team)*.
  - `/auth/context` returns `active_org.admin_tabs`; `can_open_admin = bool(admin_tabs)` (`app/api/v1/auth.py::_admin_tabs`).
  - **Members tab added 2026-10-09 (D25):** `can_org("add_member")`. Tab order: roles, members, teams, documents, strikes. Its role picker uses `GET /api/v1/admin/roles` (`assignable` flag).
  - `GET /api/v1/admin/roles` keeps its `create_role or add_member` gate (only Roles/Teams use it). The Documents tab's picker uses the new `GET /api/v1/documents/tag-options` instead.
  - *Superseded text:* "A role holding only `review_strike` (an HR reviewer) or only `upload_document` can't open the console to reach its tab. **Proposal:** widen entry to \"holds any admin-tab permission org-wide\". Waiting on the team."
  - Written into: frontend-scaffold ticket 06 §0, map, `plans/documents/frontend.md`.
- **Written into:** ticket 03 §1, ticket 05, frontend tickets 02 and 06, `spec.md`.

### D5. Commendation data model — ✅ RESOLVED 2026-10-10
- **Gap:** `give_commendation` is in the MVP (map, ticket 04 tools, ticket 05 `CommendationResponse`), but there is no `Commendation` table in ticket 02, the code, or the migrations.
- **Recommendation:** A `commendations` table that mirrors `strikes` without status or escalation: `id`, `org_id`, `team_id`, `given_by_user_id`, `given_to_user_id`, `reason`, `created_at`.
- **Also found 2026-10-10:** the map said "same hierarchy check as strikes", ticket 10 said "caller above target **or same-team peer**".
- ✅ **RESOLVED 2026-10-10 (Piyush):**
  - **Table:** `commendations` as recommended above (no status, appeal or escalation). New migration. API shapes already in ticket 05 (`CommendationResponse`, `CreateCommendationRequest`).
  - **Who may give one:** only someone **ranked above** the person in that team: the receiver's role in that team is strictly below the giver's org role or the giver's role in that team (same yardstick as strikes and D30). **No permission needed** (no `give_commendation` permission added); peers can't commend each other. Self-commendation is impossible by the same rule.
  - The ticket 10 "or same-team peer" wording is superseded.

### D6. Strike appeal fields and flow — ✅ RESOLVED 2026-10-10
- **Gap:** The PRD §8 lists `reviewed_by_user_id` and `appeal_notes` on strikes, and frontend `/admin/strikes` is designed for appeal review. The `Strike` model has neither field, and the map lists the appeal flow as undecided.
- **Also check:** With HITL Pattern A (ticket 10), the agent validates the strike before the DB commit. Is the `pending_agent_review` status still needed?
- ✅ **RESOLVED 2026-10-10 (Piyush):**
  - **New columns on `strikes`:** `appeal_notes` (the receiver's reason), `reviewed_by_user_id`, `reviewed_at`. One migration.
  - **Statuses:** a new strike is saved as `confirmed` (the agent checks policy *before* saving, D22). `pending_agent_review` is no longer used (left in the enum, not written). Receiver appeals → `appealed`. Reviewer upholds → back to `confirmed` with `reviewed_*` set, or dismisses → `dismissed`.
  - **One appeal per strike:** only the receiver can appeal, only from `confirmed`, and only if it was never reviewed.
  - **Who reviews:** anyone with `can("review_strike", team)` for the strike's team (org-level role **or** role in that team), **except the person who gave the strike**. *(2026-10-15, D55: and except the person who received it.)*
  - **Gray area (giver is the only reviewer):** the appeal **waits** for someone else. The giver never self-reviews; the Strikes tab shows them "You gave this strike, so someone else must review it" and the Admin can give `review_strike` to another role.
  - **Counting:** `confirmed` and `appealed` strikes count toward the 3-strike escalation; `dismissed` ones don't.
  - **Consequence for the admin console (D4):** the Strikes tab opens for `can_org("review_strike")` **or `review_strike` on any team** (same pattern as the Documents tab), and lists only appeals the viewer may review.

### D7. Chat LLM provider — ✅ RESOLVED 2026-10-09
- ⚠️ **Superseded in part 2026-10-12 by D44:** the agents use **Flash-Lite** too (Flash's free tier allows ~20 requests a day).
- **Decision (Piyush): Gemini Flash on Google's free tier** via the already-installed `langchain-google-genai`.
  - Two settings: `CHAT_MODEL` (read + write agents) and `ROUTER_MODEL` (Flash-Lite, higher free limits). Key in `GOOGLE_API_KEY`. Models are created with LangChain `init_chat_model`, so switching provider later is a settings change.
  - **Checked by Piyush in AI Studio (2026-10-09): Flash-Lite free tier ≈ 15 RPM, 250k TPM, 500–1,000 RPD.** Enough for development (the router makes one call per message).
  - Free-tier limits are unclear and have been cut before (third-party guides: ~10–15 RPM, ~20–1,500 requests/day). Check the real quota in AI Studio; if the daily cap is too tight, top up for demo day or switch provider via settings.
  - The lean graph (D19) keeps a message to 2–4 calls, which is what makes the free tier realistic.
  - Query-time embedding still follows D14 (must match ingestion).
  - **Unused packages:** `tavily-python` and `deepeval` removed 2026-10-09 (`uv remove` + `requirements.txt`). `ollama` kept pending D14. *(`deepeval` re-added 2026-10-16 as a dev-only package for the evaluation, D57.)*
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

### D11. Deployment realities vs current design (added 2026-10-08) — ✅ RESOLVED 2026-10-10
- **Gap:** PRD §17 says the backend runs on Railway or Render and the cache is Upstash Redis. Several MVP choices assume one long-lived process with a local disk:
  1. **The SQLite `checkpoints.db`** is lost on every redeploy unless the host has a persistent volume. Options: attach a volume, or use `AsyncPostgresSaver` (NeonDB) from the first deploy. Ticket 08 says that's a one-line swap.
  2. **The in-process `TTLCache`** (ticket 03) is only correct with **one** backend instance. The PRD's mention of Redis is stale (ticket 03 replaced it). Lock "single instance for MVP".
  3. **FastAPI `BackgroundTasks` ingestion** (ticket 11) is killed by a restart, leaving documents stuck in `processing` forever. A recovery rule is needed, for example on startup mark documents stuck longer than N minutes as `failed`, or re-queue them.
- **Recommendation:** Run a single instance for the MVP and use the Postgres checkpointer in any deployed environment (SQLite for local dev only). Add a startup sweep for stuck `processing` documents.
- ✅ **RESOLVED 2026-10-10 (Piyush):**
  1. **Chat history:** `AsyncPostgresSaver` on NeonDB **everywhere**, local dev included (package `langgraph-checkpoint-postgres`; `saver.setup()` at startup). No SQLite checkpointer, so no dev/prod switch; `CHECKPOINTS_DB_PATH` and the local `checkpoints.db` go away when the chat endpoint is built.
  2. **Single backend instance for the MVP** (the in-process `TTLCache` relies on it). No Redis.
  3. **Stuck uploads:** already built (ticket 11 §7a, `fail_stale_ingestions()` in the `main.py` lifespan, 15 minutes).

### D12. Single-org or multi-org for v1? (added 2026-10-08) — ✅ RESOLVED 2026-10-10
- **Conflict:** The map's "Out of scope" says "Multi-tenant SaaS billing (v1 = single org workspace)". Everything else is built for **multiple orgs per user**: the `org_members` bridge table, `org_id` on every row, Clerk Organizations, `/org-selection`, and `thread_id = {org_id}:...`.
- **Likely intent:** "Billing is out of scope", not "only one org exists". If so, reword that line to "no billing; multi-org supported, each org isolated by `org_id`". Confirm.
- ✅ **RESOLVED 2026-10-10 (Piyush): multi-org.** A user may belong to several orgs and switches between them (`/org-selection`); each org's data is isolated by `org_id`. Only billing/Stripe is out of scope. No code change; the map's "Out of scope" line is reworded.

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
- **Extended 2026-10-13 by D45** (card text written by code, checks before the card, one action per message, card survives reload, double-click safe).

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
- `give_strike` / `give_commendation` take `team_id` as well as `to_user_id` (a person can be on two teams; the hierarchy check is per team). Filled from the `@team` mention or asked for by the agent. *(2026-10-12, D43: teams are picked with `/`, people with `@`.)*
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

### D27. Request protection: CORS and rate limits (added 2026-10-10, raised by Piyush) — ✅ RESOLVED 2026-10-10
- **Gap:** Nothing said where request protection lives. The frontend map only listed "Edge security: Arcjet". Piyush proposed CORS plus chained Arcjet with four custom tiers: read, write, heavyRead (fewer requests than read), heavyWrite.
- **Decision (Piyush): Arcjet in Next.js, front gate + per-action; no CORS.**
  - **No CORS on FastAPI.** The browser only talks to Next.js (same origin); Next.js → FastAPI is server-to-server, where CORS doesn't apply. Adding `CORSMiddleware` would only let browser JS call FastAPI directly, against the BFF rule.
  - **Arcjet lives in Next.js, not FastAPI.** Every request reaching FastAPI comes from the Next.js server's IP, so bot and IP checks can't tell users apart there.
  - **Front gate (`proxy.ts`, every request):** shield + bot detection (search engines and link previews allowed), plus the **read** limit for signed-in users, in one Arcjet call. `/api/uploadthing` skips it (UploadThing's server callback would look like a bot).
  - **Per-action tiers:** `proxy.ts` can't tell Server Actions apart (they all POST to the page URL), so each action calls `limit(tier)` first and returns `{ ok: false, message }` for the toast (D18). Limits are per Clerk `userId` (sliding window):
    - read 120/min (proxy.ts);
    - write 20/min (role create/edit/delete, document delete, cancel invite);
    - heavyRead 5/min (chat message: 2–4 Gemini calls each; wire into the chat route when built, ticket 09);
    - heavyWrite 10 per 10 min (document indexing, invites).
  - **Code:** `frontend/lib/middleware/` (`arcjet.ts` rules + numbers, `gate.ts` front gate, `limit.ts` per-action). Not named `frontend/middleware/` because Next.js 16 deprecated that name for `proxy.ts`. Blocked → 429 `rate_limited` / 403 `blocked` in the D16 shape.
  - **No `ARCJET_KEY` → Arcjet is off** and everything passes, so teammates can run without a key.
- ~~**Known gap (ties to D11 deployment):** Arcjet guards only the Next.js door.~~ Closed by D62 (2026-10-18): FastAPI refuses `/api/v1` calls without the shared secret. Original text: Arcjet guards only the Next.js door. If FastAPI's URL is public, a signed-in user could call it directly with their own token and skip the limits; keep FastAPI unreachable from outside when deploying.

### D28. Where does team work happen: a `/teams` page for everyone, or `/admin/teams` only? (added 2026-10-10, teams effort, raised by Piyush) — ✅ RESOLVED 2026-10-10
- **Gap:** frontend tickets 01/06 and `spec.md` put teams only under `/admin/teams` (tab opens for `can_org("add_member")` or `can_org("create_team")`; `auth.py` `admin_tabs`). Piyush's idea: `/teams` lists teams, `/teams/[teamId]` has "Add member" and "Create task". With admin-only teams, a team-level manager (team role with `add_member`/`assign_task`, no org role) and plain team members can't open their own team.
- **Recommendation:** `/teams` + `/teams/[teamId]` in the main app for everyone. The list = teams you can see (D13: on it, or every member is below you), not only teams you created. Buttons by permission: Create team = `can_org("create_team")`; Add member = `can("add_member", team)` (existing org members only, D25; team role strictly below the caller, D9); Create task = `can("assign_task", team)`. Backend routes under `/api/v1/teams` (not `/admin/teams`). The admin Teams tab is dropped. `/tasks` stays as "all my tasks" and uses the same create-task endpoint.
- **Decision (Piyush, 2026-10-10):** recommendation accepted as written. Updated: map, ticket 05 (team endpoints move to `/api/v1/teams`), frontend tickets 01/06, `spec.md`. Code drift: `auth.py` `admin_tabs` still emits `"teams"`.

### D29. Who sees a team that has no members yet? (added 2026-10-10, teams effort) — ✅ RESOLVED 2026-10-10
- **Gap:** D13 visibility = member, or *every* member ranks below you. `resolver.py::build_scope` only counts teams **with at least one member**, so a newly created, empty team is visible to nobody, including the person who just created it. Nothing decides whether the creator joins the team.
- **Recommendation:** the creator does **not** join (an Admin on every team they create would stop HR from seeing those teams under D13, and put the Admin in team task lists). An empty team is visible to anyone with org-level `create_team` or `add_member` (the people who can staff it). Once it has a member, the normal D13 rule applies. Small change in `build_scope` (also fetch empty teams in the org).
- **Alternative:** "Create team" also asks for a first member (team lead + team role), so a team is never empty.
- **Decision (Piyush, 2026-10-10):** recommendation accepted. Creator doesn't join; empty teams visible to org-level `create_team` / `add_member` holders; normal D13 once staffed. Code: `build_scope` (ticket 03) to include empty teams for those holders.

### D30. Which team role may a team manager give when adding someone to their team? (added 2026-10-10, teams effort) — ✅ RESOLVED 2026-10-10
- **Gap:** D17 measures "strictly below the caller" from the **org-level role only** (`manageable_role_ids`, used by `services/members.py::_get_assignable_role`). That fits creating roles and org invites. But D28 lets a team-level manager (team role with `add_member`, no org role) add members on `/teams/[teamId]`; with the org-only yardstick they could give no role at all, so a team-level `add_member` would be useless.
- **Recommendation:** for team actions, the yardstick is the caller's org role **or** their role in that team: the given role must be strictly below either one, and carry only permissions the caller has in that team (`can(p, team)`). Same rule for removing a member. Org-level actions (D17) unchanged.
- **Decision (Piyush, 2026-10-10):** recommendation accepted. Code: an `AccessScope` helper for "roles below me in this team" (org role ∪ team role) used by the team member endpoints.

### D31. Deleting a team: what happens to its tasks, strikes and documents? (added 2026-10-10, teams effort, raised by Piyush) — ✅ RESOLVED 2026-10-10
- **Gap:** no ticket covers deleting a team. `tasks.team_id`, `strikes.team_id`, `documents.team_id` and `invitations.team_id` all point at `teams.id` with the default ON DELETE (restrict), so a plain delete fails once the team has any work.
- **Recommendation:** `DELETE /api/v1/teams/{id}` needs `can_org("create_team")` and a team the caller oversees (empty, or every member below them, D13/D29). It is allowed only while the team has **no tasks, strikes or team documents** (else 409 `team_not_empty`); its member rows and pending team invitations go with it, then `invalidate_org`. Same idea as roles: a role someone holds can't be deleted. No migration.
- **Alternatives:** delete everything with it (loses strike history); archive instead of delete (needs a migration and an "archived" filter in every team query).
- **Decision (Piyush, 2026-10-10):** recommendation accepted (block until empty).
- **Built 2026-10-10 (teams slice C):** invitations that name the team are not deleted but turned into org-only invites (`team_id` and `role_id` cleared): the invitee still joins the org with no role, no Clerk call, and a team role can't turn into an org role. Since D25 the app no longer creates team invites, so this only covers old rows.

### D32. Tasks: who may create one, and for whom? (added 2026-10-10, tasks effort) — ✅ RESOLVED 2026-10-10
- **Scope of the first tasks round (Piyush, 2026-10-10):** core only: create, list (team page + `/tasks`), change status, edit, delete. Dependencies (`blocked_by_task_id`), submissions and comments come later; their tables exist, so no migration is needed then.
- **Who creates (Piyush, 2026-10-10):** whoever's role has `assign_task` in that team: `can("assign_task", team)` (org role or team role).
- **Gap: for whom.** Ticket 04/10 only says `create_task` checks `assign_task`. Nothing says whether a manager may assign work to a peer manager or to someone above them. The locked rule (D9) is that users act only on roles strictly below their own.
- **Recommendation:** assignee = yourself, nobody, or a team member whose team role passes `can_give_in_team` (strictly below your org role or your role in that team, D30). The assignee must be on the team. Same rule for the chat agent's `create_task` (it calls the same service function).
- **Decision (Piyush, 2026-10-10):** the assignee must be **a team member ranked below the creator** (`can_give_in_team(assignee's team role, team)`, D30 yardstick). Assigning to yourself and unassigned tasks are **not** allowed for now (easy to add later). `tasks.assigned_to_user_id` stays nullable in the DB; the API requires it.

### D33. Tasks: who may change status, edit or delete? (added 2026-10-10, tasks effort) — ✅ RESOLVED 2026-10-10
- **Gap:** nothing says who may move a task between todo / in progress / done / blocked, or edit (title, description, deadline, assignee) or delete it.
- **Recommendation:** a task's **managers** = people with `can("assign_task", team)` for whom the assignee's team role passes `can_give_in_team` (exactly who could have created it, D32). Managers may do everything; the **assignee** may only change the status. If the assignee has left the team, anyone with `assign_task` in the team counts as a manager. Reassigning follows D32 for the new assignee. Each task carries `can_edit` / `can_change_status` flags for the buttons.
- **Decision (Piyush, 2026-10-10):** recommendation accepted.

---

### D34. Document uploads: an admin tab, or a button on the `/documents` page? (added 2026-10-11, raised by Piyush while fixing the sidebar) — ✅ RESOLVED 2026-10-11 · ⚠️ SUPERSEDED the same day by D37 (back to an admin Documents tab; no `/organization` page)
- **Today (ticket 06, D4 follow-up):** uploading, tagging and deleting documents live at `/admin/documents`, gated by `upload_document` (org-wide **or on any team**). `/documents` is the read-only browser for everyone. A team manager who may upload therefore opens "Admin" just to see one tab.
- **Proposal (same reasoning as D28 for teams):** one `/documents` page for everyone; "Upload" shown when the user has somewhere to tag a document (`GET /documents/tag-options` not empty); "Delete" per row from `deletable`. Drop `documents` from `admin_tabs`; Admin = Roles, Members, Strikes. Backend data rules (D23) unchanged.
- ✅ **RESOLVED 2026-10-11 (Piyush):** `/documents` becomes **`/organization`**: a short description of the org at the top, then the policy documents the user may see, grouped "Whole organization" / "Your role" / "Your team". **Upload policy** shows when tag-options is not empty; **Delete** per row from `deletable`. `/admin/documents` is dropped and `documents` leaves `admin_tabs` (Admin = Roles, Members, Strikes). Data rules (D23), UploadThing gate and endpoints unchanged.
  - **Clarified:** task submissions (work handed in on a task, `task.py`) are a separate upload inside tasks, open to the task's assignees with no `upload_document` permission. Policy documents are the AI chat's knowledge base.
  - **Follow-ups:** backend drops `documents` from `_admin_tabs()` (`api/v1/auth.py`) and the `admin_tabs` Literal; who may edit the org description (next question, D35).
  - **Built 2026-10-11:** `documents` dropped from `_admin_tabs()` and the Literal; `GET`/`PATCH /api/v1/orgs/current` (`services/orgs.py::get_org_profile/update_org_description`, D35 check = caller's org-level role is the `is_system` role); `lib/api/queries/orgs.ts::getOrganization`, `lib/api/actions/orgs.ts::updateOrgDescription`. 58 tests pass; not yet called against the live DB.
  - **Written into:** frontend-scaffold tickets 01 and 06, `spec.md`, both maps, `plans/documents/`.

### D35. Who may edit the organization's description? (added 2026-10-11, follow-up to D34) — ✅ RESOLVED 2026-10-11 · ⏸ PARKED by D37: no page shows the description now; `GET`/`PATCH /api/v1/orgs/current` stay in the backend
- **Gap:** `/organization` shows `organizations.description` (column exists, nullable), but no endpoint reads or writes it and no permission covers it (`ROLE_PERMISSIONS` has none for org details).
- **Proposal:** holders of the protected root `Admin` role (`is_system`) may edit it with an Edit button on `/organization`; everyone else reads. No new permission. Alternative: anyone with org-wide `create_role`.
- ✅ **RESOLVED 2026-10-11 (Piyush):** only holders of the protected root `Admin` role (`is_system`) may edit the description (Edit button on `/organization`); everyone in the org reads it. No new permission.
- ⏸ **Parked 2026-10-11 (Piyush, after D37):** the admin tab stays named "Documents" (not "Organization"); no page shows the description for now. If it comes back, the suggested home is the Dashboard (everyone reads; Edit only for the `is_system` Admin), reusing `GET`/`PATCH /api/v1/orgs/current`.

### D36. Admin navigation: a tab bar inside `/admin`, or the sidebar's Admin sub-list only? (added 2026-10-11, frontend review of commit 390608c) — ✅ RESOLVED 2026-10-11
- **Conflict:** frontend ticket 06 §1 gives the admin layout a top tab bar; the sidebar redesign (2026-10-11, `spec.md` `nav-items.tsx`) made the sidebar's Admin entry open a sub-list of `admin_tabs`. Both were built, plus the header breadcrumb ("Admin › Members"): three navigations, and the tab bar never highlights the current tab and adds a second `<main>`.
- ✅ **RESOLVED 2026-10-11 (Piyush):** **sidebar only.** `admin/layout.tsx` keeps only the permission gate (redirect unless `can_open_admin`) and renders `children` with no heading, tab bar or `<main>`. The sidebar sub-list and the breadcrumb show where the user is. `admin_tabs`, the per-page re-checks and the backend are unchanged.
  - **Written into:** frontend-scaffold ticket 06 (§0, §1, new §4 fix list), `spec.md`, both maps.

### D37. Who may see the org's documents in the app? (added 2026-10-11, raised by Piyush before building `/organization`) — ✅ RESOLVED 2026-10-11
- **Question:** D34 made `/organization` a page every member opens (each sees only the documents their role/team may see; Upload/Delete only for people allowed). Should people with no upload permission have a documents page at all?
- ✅ **RESOLVED 2026-10-11 (Piyush):** **no. Documents go back to an admin tab, `/admin/documents`.** "I don't want anyone with no permission the ability to see our org documents."
  - **Tab gate:** `upload_document` org-wide **or on any team** (as before D34). The page lists the documents the user may see (D23 visibility, unchanged), with Upload (if tag-options isn't empty) and Delete (if `deletable`).
  - **Everyone else** has no documents page. The AI chat still answers each person from the documents their role/team may see (the RAG feature itself is unchanged).
  - **Supersedes** D34 (`/organization` page) and parks D35 (org description has no page).
  - **Built 2026-10-11:** `_admin_tabs()` (`api/v1/auth.py`) and the `admin_tabs` Literal include `documents` again; `openapi.json` + `v1.d.ts` regenerated; 58 backend tests pass. Frontend: `admin/documents/` restored with the teammates' file names (plus the lint/polling fixes), `organization/` removed, document actions refresh `/admin/documents`, sidebar Admin list shows Documents. `tsc` and `next build` pass.
  - **Written into:** frontend-scaffold ticket 06 (§0 table, §1, §4), `spec.md`, both maps, `plans/documents/frontend.md`.

### D38. Removing a member and changing their org role: who counts as "below you", and what happens to their work? (added 2026-10-11, members round 2) — ✅ RESOLVED 2026-10-11
- **Already decided (D10-C, D9, D17):** `DELETE /api/v1/admin/members/{user_id}` removes the Clerk membership first (otherwise just-in-time membership re-adds them), then their `team_members` and `org_members` rows. Only for people below the caller; the root `Admin` holder can never be removed. Changing the org role follows the invite rules: org-wide `add_member`, new role strictly below the caller and holding only permissions they have, or "no role"; nobody changes their own role.
- **Gap 1:** how to rank a person with no org-level role (only team roles).
  - ✅ **Decision (Piyush):** **every role they hold must be below the caller's org role**: their org role (if any) and each of their team roles (`can_manage_role`). Example: Recruiter and Manager are siblings; a Recruiter with `add_member` can't remove a person who is Manager on Team Alpha. A person with no roles at all can be acted on by any `add_member` holder (except themselves).
- **Gap 2:** what happens to their tasks, strikes and documents.
  - ✅ **Decision (Piyush):** **keep everything.** Tasks stay under their name; the team's managers may reassign or close them (D33: an assignee who left the team doesn't block). Strikes and uploaded documents stay as history. The `users` row stays (a removed person can be added again later).
- **Implementation detail:** for a few minutes after removal the person's old session token may still name the org; requests in that window get 403 `not_a_member` (the frontend sends them to `/org-selection`) instead of being re-added just-in-time.
- **Built 2026-10-11 (not yet live-tested):** `PATCH /api/v1/admin/members/{user_id}` `{role_id | null}` and `DELETE /api/v1/admin/members/{user_id}` (`services/members.py::update_member_role/remove_member`, `clerk.remove_org_membership`); `MemberResponse.manageable`; `deps.ensure_org_member` refuses a just-removed user (`not_a_member`). Frontend: `actions/members.ts::updateMemberRole/removeMember`, `errors.ts` redirects `not_a_member` → `/org-selection`, Members table Actions column + `change-role-dialog.tsx` + `remove-member-dialog.tsx`. 58 backend tests pass; `tsc`, lint and `next build` pass.

### D39. Can a document's title, description or audience be changed after upload? (added 2026-10-11, raised by Piyush) — ✅ RESOLVED 2026-10-11
- **Gap:** delete existed (D23: "if you could upload it there, you can delete it"); changing a document didn't, so fixing a wrong audience meant delete + re-upload + re-index, and the wrong audience could read it (and get it in chat answers) meanwhile.
- ✅ **Decision (Piyush):** an **Edit** button on rows with `deletable: true`: title, description and **who sees it** (org / role / team). Rules = delete's rule for the current audience, plus upload's rule (D23) for the new one. Replacing the file stays delete + upload.
  - The document's chunks carry their own copy of the audience (denormalized for search), so the edit updates them in the same commit: the chat follows at once, no re-indexing.
  - Changing the audience while the document is `processing` → 409 `document_processing` (ingestion copies the audience onto the chunks it writes). Renaming is always allowed.
- **Built 2026-10-11 (not yet live-tested):** `PATCH /api/v1/documents/{id}` (`UpdateDocumentRequest`, `services/documents.py::update_document`, tag checks shared with upload in `_check_tag`); `actions/documents.ts::updateDocument`; `admin/documents/_components/edit-document-dialog.tsx` + pencil button in `documents-table.tsx`. 58 backend tests pass; `tsc`, lint and `next build` pass.

### D40. Deleting a document leaves its file in UploadThing (added 2026-10-11, raised by Piyush) — ✅ RESOLVED 2026-10-11
- **Gap:** delete removed the `documents` row and its chunks (FK `ON DELETE CASCADE`) but never the file in UploadThing: storage kept filling up and the old link kept working. Deleting the file naively was unsafe: any uploader could register a second document with a file link they can see (e.g. an org-wide policy) and then delete their copy, taking the original's file with it.
- ✅ **Decision (Piyush): one file belongs to one document, and delete removes the file.**
  - `create_document` refuses a `file_url` already used by any document (all orgs share one UploadThing app) → 409 `file_already_registered`. No migration, no contract change (409 was already listed).
  - `actions/documents.ts::deleteDocument` reads the document, deletes it in the backend, then calls `UTApi().deleteFiles(<key>)` with the key from the `/f/<key>` link. A failed file delete is only logged: the document is already gone from Trellis.
- **Built 2026-10-11 (not yet live-tested):** 58 backend tests pass; `tsc` and lint pass.

### D41. Chat screen: what is it called, and where does it live in the frontend? (added 2026-10-12, chat effort, raised by Piyush) — ✅ RESOLVED 2026-10-12
- **Gap:** task discussions (`task_comments`, ticket 02) are also "threads", so "chat" could mean two things; and the spec had only `chat/page.tsx`, with no place for the list of a user's chats or for opening one chat by URL.
- ✅ **Decision (Piyush):**
  - **Names:** the agent screen stays **Chat** (`/chat`, matching D2's `/api/v1/chat/...` and `chat_sessions`). Task discussions are **Comments**, shown inside a task, never a page of their own. The word "thread" is not used in the UI: in the backend it already means one chat (LangGraph `thread_id`).
  - **Layout:** stays inside `(dashboard)` (same sign-in check, onboarding redirect and app sidebar). `chat/layout.tsx` adds a hideable chat-list panel (New chat, past chats with rename/delete; a drawer on phones) beside the conversation and fills the height under the header. It is a plain panel, not a second shadcn `Sidebar` (both would share the `sidebar_state` cookie). Routes: `/chat` = new chat, `/chat/[sessionId]` = an existing chat.
  - **Rejected:** chats inside the app sidebar (ChatGPT style; would fetch the chat list on every page and hide it when the sidebar is collapsed) and a separate route group (copies the shell, loses the nav).
- **Written into:** frontend-scaffold spec (chat tree), frontend-scaffold/07, map.

### D42. When is a new chat created? (added 2026-10-12, chat effort; D2's "default, not yet confirmed") — ✅ RESOLVED 2026-10-12
- **Gap:** D2 left open whether the frontend creates the chat first (`POST /api/v1/chat/sessions`) or the chat is created by the first message. With D41's screen, "New chat" opens `/chat`; creating a row on that click would leave empty "New chat" rows in the list whenever someone clicks it and leaves.
- ✅ **Decision (Piyush): on the first message.** "New chat" creates nothing. The row is created when the first message is sent (frontend calls create, then sends, and the URL becomes `/chat/<id>` without a reload). D2's two-call shape stays; only the timing is fixed.
- **Built 2026-10-12 (chat slice E):** the address changes to `/chat/<id>` once the first answer has finished, not while it streams (changing the URL mid-answer re-rendered the page and cut the stream off).
- **Written into:** D2 (default now confirmed), ticket 08 §4, map. Plan: `plans/chat/` (local).

### D43. Mentions in the chat box: what do `@` and `/` open, and who is listed? (added 2026-10-12, raised by Piyush during chat slice A) — ✅ RESOLVED 2026-10-12
- **Gap:** ticket 10 (write node) says the chat UI supports `@user` / `@team` mention tokens carrying exact ids so the agent never guesses a name, and D22 says `give_strike` / `give_commendation` take `team_id` "from the `@team` mention". Nothing says which key opens which list, who appears in it, or how the token reaches the agent. `plans/chat/` didn't include it.
- **Follows from existing rules (no decision needed):** the lists show only people and teams the user can already see (D13: teams you're on or oversee, and the members of those teams); the token is a hint, not a permission: the tools still check `AccessScope` (D1), so a forged id finds nothing.
- ✅ **Decision (Piyush):**
  - **`@` = a person, shown by email** (unique and recognisable). The pop-up lists "name · email", filters on either, and the chip shows the email. People listed = members of the teams you can see (D13), yourself included.
  - **`/` = a team**, only teams you can see (D13).
  - The pop-up opens only at the start of a word (so "and/or" doesn't trigger it).
  - **Sent to the backend** as `@[karan@acme.com](user:<uuid>)` / `/[Alpha](team:<uuid>)`; the agent prompt explains the tokens and uses the ids in tool calls (`get_tasks` gains an assignee filter so "@Karan's tasks" works). The ids are hints; scope still decides (D1).
  - Backend: `GET /api/v1/chat/mentions` → `{ people: [{id, name, email}], teams: [{id, name}] }` (chat slice B).
  - *2026-10-15 (Piyush):* picked mentions are colored in the box while typing too (people blue, teams green, as in sent messages), via a colored copy of the text over the textarea; a mention edited after picking loses its color, matching that it is then sent as plain text.
- **Written into:** ticket 10 (write node note), D22 note (`@team` → `/team`), map. Plan: `plans/chat/`.
- ⚠️ **Superseded in part 2026-10-14 by D51:** `@` now lists every org member (teammates first); `/` unchanged.

### D44. Gemini Flash's free tier is ~20 requests a day: which model answers chat? (added 2026-10-12, chat slice C live test) — ✅ RESOLVED 2026-10-12
- **Gap:** D7 picked Gemini Flash (`CHAT_MODEL=google_genai:gemini-flash-latest`) for the agents and Flash-Lite for the router, on the free tier. During the slice C test, Flash returned 429 `RESOURCE_EXHAUSTED` after ~20 requests: `generate_content_free_tier_requests, limit: 20, model: gemini-3.8-flash` (per day, per project; reset in ~15 h). A chat message uses 2–4 LLM calls, so the whole team gets ~5–10 answers a day. Flash-Lite (router) was not limited. Unofficial 2026 guides put Flash-Lite at ~500 requests/day free; Google no longer publishes a fixed table (the live quota is in AI Studio).
- **Already handled in code (no decision needed):** LLM retries cut from 6 to 2 (a quota error reaches the user in seconds, not ~45 s); the error event says "reached its free usage limit for now. Please try again later."
- ✅ **Decision (Piyush): Flash-Lite for everything.** `CHAT_MODEL` default is now `google_genai:gemini-flash-lite-latest` (same as `ROUTER_MODEL`; `.env` has no override). Re-tested the same day: document answer with 2 verified badges, `/team` and `@person` mentions with exact ids, small talk, injection attempt (answered within access, flagged) all pass; answers in 7–11 s (27 s for the first, document search + grading). Billing can still be turned on later by setting `CHAT_MODEL` back to Flash; no code change.
- **Written into:** D7 (superseded note), `app/core/config.py`, map.

### D45. Write tools: hardening the Confirm card (added 2026-10-13, write-tools review, raised by Piyush) — ✅ RESOLVED 2026-10-13
- **Gaps in D22:** it doesn't say who writes the card's summary, checks rules only on Confirm, doesn't cover several actions in one message, a page reload, or a double click.
- ✅ **Decision (Piyush): all five.**
  1. **Card text is written by code** from the action's actual values (names, team, deadline, reason), never by the LLM, so the card always matches what is saved. A prompt-injected document can't make the card say one thing and save another.
  2. **Checks run before the card** (same service rules as the real write, without writing): a refused action never becomes a card; the agent tells the user why. The re-check on Confirm (D22 step 5) stays.
  3. **One action per message.** If the LLM proposes several writes, only the first becomes a card and the agent asks the user to send the next one separately.
  4. **The card survives a reload:** the chat detail endpoint returns the waiting action from the checkpoint, and the UI shows the card again.
  5. **Double-click safe:** a `resume` when nothing is waiting → `409 nothing_to_confirm`; nothing is written twice.
- **Build order:** `create_task` (service exists, proves pause → card → resume) → `give_commendation` (D5 migration + service) → `give_strike` (D6 migration + policy check). Open for the strike step: does a "policy doesn't support this reason" result block the strike or only warn?
- **Written into:** D22 (extension note), ticket 10, map.
- **Built 2026-10-13 (step 1, `create_task`):** graph `write_agent → prepare_action → confirm_action` (`interrupt()`), per-action code in `app/agent/actions.py` (prepare = `services/tasks.py::check_create_task`, execute = `create_task`), `SendMessageRequest.resume`, SSE `confirm` (`ConfirmCard`: action, summary, details, policy), `ChatDetail.pending_action`, statuses `preparing_action` / `saving_action`. Frontend: `confirm-action-card.tsx`, `use-chat-stream.ts` (`confirm` event, `respond()`), BFF route forwards `resume`. A deadline date means the end of that day (UTC). **Live-tested 8/8** (card, reload, confirm saves, second click 409, cancel, new message cancels, task for yourself refused, missing person → asks). Strike/commendation requests still get "not available yet" from the write agent.
- **Built 2026-10-13 (step 2, `give_commendation`, D5):** `models/commendation.py` + migration `f3b8d1e6a724` (applied to the dev DB), `schemas/commendations.py`, `services/commendations.py` (`check_give_commendation` / `give_commendation`: team visible, not yourself, person on the team, their team role passes `can_give_in_team`), agent tool + action (card: Person, Team, Reason; the reason stays in the user's words). Follows D31: a team with commendations can't be deleted (`team_not_empty` lists them). No REST endpoint or page shows commendations yet (dashboard, later). **Live-tested 8/8** (card, reload, confirm saves, second click 409, cancel, yourself refused, missing reason → asks, strike → not available yet).

### D46. Strikes from chat: what if no policy covers the reason? (added 2026-10-13, write tools step 3) — ✅ RESOLVED 2026-10-13
- **Gap:** ticket 10 says `give_strike` "evaluates if the reason is a policy-compliant infraction" before the card, but not what happens when it isn't.
- ✅ **Decision (Piyush): warn, don't block.** Before the card, the reason is searched in the policy documents the giver can see and one LLM call judges it: `supported` / `not_covered` (or `unchecked` if the check can't run). The card shows the verdict, a one-line explanation and the passages used (only retrieved ones, same code check as citations). The manager can confirm either way; the verdict and passage ids are saved on the strike (`agent_evaluation`, `policy_chunk_ids`) so appeal reviewers (D6) see them.
- **Why not block:** an AI judgment can be wrong and blocking has no override; a demo org may not have a policy for every case; the human who confirms stays accountable and appeals are the safety net.
- **Written into:** ticket 10, map.
- **Built 2026-10-13 (write tools step 3, `give_strike`):** migration `a9c4e2f7b815` (D6 columns `appeal_notes`, `reviewed_by_user_id`, `reviewed_at` + index `team_id, given_to_user_id`; applied to the dev DB), `Strike.status` default `confirmed`; `schemas/strikes.py`, `services/strikes.py` (`check_give_strike` / `give_strike`: team visible, `can("give_strike", team)`, not yourself, person on the team and below you; the 3rd active (confirmed/appealed) strike in a team is saved `escalated`); `actions.py::_policy_check` *(moved 2026-10-15 to `services/strikes.py::check_policy`, D54)* (search the giver's visible documents with the reason, Flash-Lite structured verdict, only retrieved passages kept; `supported` without a passage is downgraded to `not_covered`); `ConfirmCard.policy` typed as `PolicyCheck` (verdict, explanation, sources); card shows a green / amber / grey policy box with source badges, plus an "Active strikes" line that warns when this one escalates. **Live-tested 9/9** (card + policy, reload, confirm saves `confirmed` with the evaluation, second click 409, cancel, 3rd strike escalated, yourself refused, missing reason → asks, TEST-Employee without `give_strike` refused) plus the policy check on the test handbook: "missed a deadline without notice" → `supported` (handbook part 2), "shared a password" → `not_covered`. Escalation only sets the flag; notifications are still undecided (map, "Open backend decisions").

### D47. Dashboard: what does the "my work" part show? (added 2026-10-13, dashboard effort) — ✅ RESOLVED 2026-10-13
- **Gap:** ticket 05's `DashboardResponse.my_tasks` is only task counts. Frontend ticket 01 and `spec.md` also put "your strikes" on `/dashboard` (`personal-strikes-card.tsx`) and a deadlines widget, but no backend shape exists for them. Commendations (D5) appear nowhere yet.
- **Proposal:** `my_tasks` counts + the next 5 open tasks by deadline + my strikes (active, with team, reason, giver, date, status) + my 5 latest commendations. Read-only; the Appeal button comes with the strike-appeals effort (D6).
- ✅ **Decision (Piyush): the proposal.** `DashboardResponse` gains `upcoming_tasks` (next 5 open tasks by deadline), `my_strikes` (non-dismissed, newest first) and `recent_commendations` (latest 5), all the caller's own. Read-only.
- **Written into:** ticket 05 §7, frontend-scaffold ticket 08, map.

### D48. Dashboard: how fresh is the data, and which charts? (added 2026-10-13, dashboard effort; frontend-scaffold ticket 08's leftovers) — ✅ RESOLVED 2026-10-13
- **Gap:** frontend ticket 08 leaves open: server vs client fetching, a polling interval, and which Recharts charts. The map lists "real-time vs polling" as unspecified.
- **Proposal:** the page loads its data on the server when opened (Server Component, `GET /api/v1/dashboard`), with no polling; Server Actions already `revalidatePath`, so it's fresh after any change. One chart only: a task-status bar chart for "my tasks"; team cards and org totals are plain number cards.
- ✅ **Decision (Piyush): the proposal.** No polling for the MVP; live updates stay a v2 topic.
- **Written into:** frontend-scaffold ticket 08, map.

### D49. How browser forms check their input (added 2026-10-13, raised by Piyush: "why no zod?") — ✅ RESOLVED 2026-10-13
- **Gap:** D18 decided how forms *send* writes (Server Actions), but the frontend map left "react-hook-form + zod vs. Server Actions alone" open. `zod` and `@hookform/resolvers` were installed but unused; `react-hook-form` itself was not installed (an unrelated `form` package was). Each of the 8 forms grew its own manual checks with toast-only errors, and Server Actions forwarded input unchecked (TypeScript types vanish at runtime), relying only on backend Pydantic.
- ✅ **Decision (Piyush): zod + react-hook-form, with zod schemas generated from the backend** (amended same day: "zod schemas are how the frontend stays in sync").
  - **Generated, not hand-written.** `pnpm api:generate` turns `backend/openapi.json` into both the TypeScript types (`v1.d.ts`, unchanged) and zod schemas (`lib/api/schemas/zod.gen.ts`, via `@hey-api/openapi-ts` with only its zod plugin, config in `frontend/openapi-ts.config.ts`). Pydantic's rules (min/max length, email pattern, enums, uuid) carry over, so a backend change + regenerate updates every form's checks. Never edit the generated file.
  - **One file per area under `lib/api/schemas/`** (Piyush, for readability), matching `actions/` and `queries/`: `roles.ts`, `members.ts`, `teams.ts`, `tasks.ts`, `documents.ts`, `chat.ts`, `orgs.ts` re-export that area's generated schemas; `shared.ts` holds the friendly error wording (`z.config`), `firstError()` for toasts and `emptyAsNull()` (a picker's "None" = `""` becomes `null`). Code imports from the area file (`@/lib/api/schemas/roles`), never from `zod.gen.ts`.
  - **Forms use the generated request schema** (e.g. `zCreateRoleRequest`). Frontend-only fields (a confirm checkbox, a local date input) use `.extend()` in the area file; backend fields are never redefined by hand. A form's value type is `z.input<typeof schema>`. An edit form that always sends every field may check with the create schema (Edit role does); its Server Action still checks with the update schema.
  - Dialogs use `useForm({ resolver: zodResolver(schema) })` with shadcn's `Form` components: errors show under the field, not only as a toast.
  - Server Actions `safeParse` the same generated schema first and return `{ ok: false, message }` on bad input (D18 shape unchanged). Pydantic stays the final check.
  - Cross-field rules the backend checks in code (a `role` audience needs `role_id`) can't appear in OpenAPI; the area file adds them with `.superRefine()` (documents).
  - Dates: the generator allows offsets and no-timezone datetimes (`dates: { offset: true, local: true }`), like Pydantic.
  - The client stays `openapi-typescript` + `openapi-fetch` (no client migration). Responses are not zod-parsed in the MVP.
- **Built 2026-10-13:** `@hey-api/openapi-ts` + `react-hook-form` added, stray `form` removed, shadcn `field` added. Every Server Action that sends a body (roles, members, documents, chat, teams, tasks, orgs) and the chat stream route `safeParse` first. Converted dialogs: New/Edit role, Invite member, Change role, Upload & share, Edit document, Rename chat. The chat message box stays a plain controlled textarea (mention pop-up, text owned by the page); its body is checked by `zSendMessageRequest` in the stream route. Sample inputs through every form schema behave as expected; `tsc`, eslint on changed files and `next build` pass. Not yet tried in a browser. Piyush confirmed the role form shows errors under the field. Same day: ready-made form versions for the teammates' upcoming dialogs (`zCreateTeamForm`; `zCreateTaskForm` / `zEditTaskForm`, where a picked day becomes the end of that day in the user's time zone), and the teams / tasks / dashboard briefs in `plans/` now teach the pattern. **Bug fixed same day:** Admin → Documents stayed on "Indexing…" after an upload (backend ready in ~6 s). Cause: `router.refresh()` called right after a Server Action that already revalidates the page; the two updates collided and the Next.js router queue stalled (every later refresh/navigation ignored until reload). Fix: removed the extra `router.refresh()` in Upload & share and Invite member; the table's polling is one `checkProcessingDocuments(ids)` action every 5 s that calls `refresh()` from `next/cache` when one finished (replaces per-document `getDocumentStatus` + client refresh). Re-tested in the browser with Arcjet temporarily off: Indexing → Ready in ~13 s without reload. Rule added to `frontend/CLAUDE.md`.
  - Remove the stray `form` package.
- **Written into:** frontend-scaffold map, `spec.md`, `frontend/CLAUDE.md`.

### D50. Optimistic updates with TanStack Query: how does the browser re-read data after a change? (added 2026-10-14, raised by Piyush: "optimistic updates using TanStack Query, page by page"; frontend-scaffold ticket 09) — ✅ RESOLVED 2026-10-14
- **Gap:** an optimistic update shows the change at once, then re-reads the list from the server to confirm it (or rolls back on error). TanStack Query does that re-read *from the browser*. Today the browser has no read path: reads are Server Components (`lib/api/queries/`), writes are Server Actions (D18), and D18 says "Route Handlers stay only for streaming". Also, a query seeded with `initialData` ignores the fresh props that `revalidatePath` sends, so the cache would go stale without its own re-read.
- **Options:**
  - **A (recommended):** small read-only GET Route Handlers per page (e.g. `app/api/members/route.ts`) that call the existing `queries/` function and return JSON. Browser → Next.js → FastAPI, so the BFF rule (D3) holds and the `api` client stays server-only. Covered by `proxy.ts` (`gate()` read limit, JSON errors on `/api/*`). Documents' "Indexing…" polling becomes `refetchInterval`. Amends D18's "Route Handlers only for streaming".
  - **B:** no new endpoints; put the Server Action's reply into the cache (`setQueryData`). Fine for one-row changes; doesn't cover polling or changes that affect other rows (role tree).
  - **C (not recommended):** Server Actions for reads. Next.js sends them as POSTs, one at a time; polling would queue behind writes.
- **Piyush's proposal (2026-10-14), now the recommendation:** `useMutation` with the existing Server Action. `onMutate` snapshots the cache and applies the change (a create gets a temporary uuid); `onSuccess` swaps the temp id for the real one from the action's reply; `onError` restores the snapshot. No re-read after a change. Details: `mutationFn` throws on `{ ok: false }` (actions return errors, they don't throw, so `onError` would otherwise never run); temp ids only for creates; a row with a temp id is shown as pending with its buttons disabled. Gap it leaves: data that changes on its own (Documents "Indexing… → Ready", another admin's edit, returning to a page), because a cache seeded once ignores later server props. Fix: when the server sends a fresh copy of the page's data (`revalidatePath` / `refresh()`), it replaces the cache. No new endpoints; D18 unchanged.
- ✅ **Decision (Piyush): his proposal plus "the server's fresh copy wins".** Options A–C above are not used. Pages in scope, in order: setup → Admin Members → Admin Documents → Chat sidebar → Admin Roles. Dashboard (read-only) and Teams (empty) are skipped for now. Each page is tested in the browser with throttled network (change shows before the reply) and one refused change (it rolls back with a toast).
- **Written into:** frontend-scaffold ticket 09, frontend-scaffold map.
- **Teams and Tasks added 2026-10-17** (once their pages existed): `tasks/_components/use-task-changes.ts` (status, edit/reassign, delete, create with a greyed "Saving…" row; shared by `/tasks` and the team page, one cache key per list), `teams/_components/use-team-list-changes.ts` (Create team, greyed "Creating…" card), `teams/[teamId]/_components/use-team-member-changes.ts` (add with "Adding…", remove). Totals in headers and cards still come from the server. Browser-checked: each change showed within a second (dev server replies took 5–10 s); a duplicate team name rolled back. Delete team and the Hand-ins dialog unchanged.

### D51. Can the chat answer questions about a person in the org? (added 2026-10-14, raised by Piyush: "what if someone wants to enquire about a person?") — ✅ RESOLVED 2026-10-14
- **Gap:** the agent has no person lookup: its read tools are `search_documents`, `get_tasks` (team-scoped) and `get_team_summary`. "Which role is Jayant in?" or "Who is our HR person?" can't be answered, and `@` (D43) lists only members of teams you can see, so people on no team (e.g. TEST-Manager and TEST-HR on 2026-10-14) can't even be picked. Nothing says who may see another person's basic details (name, email, org role, teams); today only holders of org-level `add_member` see them, on Admin → Members (D25/D38).
- ✅ **Decision (Piyush): a company directory in chat, for everyone in the org.**
  - **`@` lists every org member** (name · email), people on teams you can see first, everyone else below. Supersedes D43's "members of teams you can see" for people; `/` still lists only teams you can see (D13 unchanged).
  - **A read-only person lookup** lets the assistant answer basic questions about anyone in the org: name, email, org role, and the teams they're on **that you can see** (team names you can't see stay hidden, D13).
  - **Nothing else widens:** tasks, strikes and commendations follow their own rules (D13, D24, D32, D33, D5); every write is still re-checked (D22/D45). Picking someone you have no rights over only gets an explanation.
  - Why: a list that differs by role felt inconsistent; a directory is normal in workplace tools, and the backend guards every action.
- **Written into:** D43 (superseded note), map. Plan: `plans/chat/` (local).

### D52. After failed document searches, the answer throws away other lookups (added 2026-10-14, found from Piyush's chat test) — ✅ RESOLVED 2026-10-14
- **Gap:** ticket 10's escape hatch (Node 4) / D19: when `search_documents` stays irrelevant after 2 rewrites, `grade` routes to `not_found`, which answers from the question alone ("couldn't find it in the documents you can access"). Since other read tools exist (`get_tasks`, `get_team_summary`, `find_people` D51), a mixed question loses their results. Seen 2026-10-14 16:58 IST: "what documents are attached to @jayant…" ran `find_people` (found him) + 3 searches → generic refusal.
- ✅ **Decision (Piyush): keep the other results.** When the searches fail after the rewrites but other lookups ran this turn, `grade` replaces the search results with `NO_DOCUMENTS_NOTE` and goes back to `read_agent` with `documents_exhausted` set (search tool unbound), so it answers from the other results and says no documents matched; `not_found` only when nothing else ran. Plus one prompt line: an @-mentioned person is always looked up with `find_people`.
- **Built + live-checked 2026-10-14 (as Admin):** "what is the role of @TEST-Employee and what documents access he has?" → role + team + "couldn't find permission details"; "what documents are attached to @Jayant" → `find_people` + search → "I couldn't find any documents attached to Jayant…" (no generic refusal); a document-only question with no match still gets the plain refusal; a handbook question still answers with citations. 58 backend tests pass.
- **Written into:** ticket 10 (Node 4 note), map.
- **Related, not decided yet:** "which documents can person X see?" has no tool (search_documents searches the caller's own documents by content).

### D53. Can the chat say which documents another person can see? (added 2026-10-14, follow-up to D51/D52, raised by Piyush) — ✅ RESOLVED 2026-10-14
- **Gap:** no tool answered "which documents can @person see?" (`search_documents` searches the caller's own documents by content), and no rule said who may learn another person's document access.
- ✅ **Decision (Piyush): anyone in the org may ask; the answer lists only documents both the asker and that person can see** (each with its audience: whole org / a role / a team). This follows the role tree: for someone below you it is their full list (you see everything shared with roles below yours); for someone at or above you it shows only documents you could already see, so nothing higher up the tree is revealed. The person's access comes from `resolve_scope()` for them, the same rule as everywhere (ticket 03, D13).
- **Rejected:** only allowing questions about people below you (redundant given the "both can see" limit); leaving it out of the MVP.
- **Built 2026-10-14:** `services/documents.py::documents_visible_to` (the one `_visible()` rule applied for the caller AND the person) + chat tool `get_person_documents` (status step `checking_document_access`). Checked on the 12 dev documents for all 12 asker/person pairs: about someone below → their full list; Employee about Admin → only the 6 documents the Employee sees; Employee about Jayant → 5 (manager and consultant documents hidden); HR doesn't see the employee handbook (TEST-Employee isn't below TEST-HR), so it never appears in HR's answers. Live chat as Admin and as TEST-Employee answers with titles and audiences.
- *2026-10-15, D56:* every answer now also says the list covers only documents you can also see and the person may have access to others.
- **Written into:** map. Plan: `plans/chat/` (local).

### D54. One page to give strikes, give commendations and review appeals (added 2026-10-15, raised by Piyush) — ✅ RESOLVED 2026-10-15
- **Gap:** `/admin/strikes` (D4/D6) was planned only as the appeal reviewer's desk, and giving strikes or commendations is possible only in chat (D22). Piyush proposed one page for all three. In Admin it wouldn't work for commendations: they need no permission, only rank (D5), so a senior who can commend juniors but holds no admin permission couldn't open it.
- ✅ **Decision (Piyush):** a **Feedback** page at **`/feedback`**, its own sidebar item (not in Admin). It replaces `/admin/strikes`; `strikes` leaves `admin_tabs` (Admin = Roles, Members, Documents).
  - **Shown if you can do at least one thing; each tab only for what you can do** (computed by the backend, like `admin_tabs`):
    - **Give a strike:** `can("give_strike", team)` on a team where someone ranks below you (`can_give_in_team`, D30).
    - **Give a commendation:** someone on one of your teams ranks below you. **D5 kept: rank only, no permission.**
    - **Appeals to review:** `review_strike` org-wide or on any team (D6). Lists only appeals you may decide; never your own strikes.
  - Giving from the page uses the same service functions as chat (`check_give_*` / `give_*`); a strike still gets the policy check (D46) and its warning **before** the user confirms. The policy check moves from `app/agent/actions.py` into a shared service so the REST route and the agent call the same code.
  - A person's own strikes, commendations and the **Appeal** button stay on `/dashboard` (D47).
- **Rejected:** keep it in Admin renamed (Admin would open for every team lead who can commend); review-only `/admin/strikes` with giving left to chat; a new `give_commendation` permission.
- **Backend needed:** list given / reviewable strikes and commendations, give (with a policy preview step), appeal, review (uphold / dismiss); a `feedback_tabs`-style flag set on `auth/context`.
- **Backend plan (Piyush approved 2026-10-15), router `api/v1/feedback.py` under `/api/v1/feedback`, no migration:** `GET /options` (tabs + per team who you may strike / commend) · `POST /strikes/check` (rules + policy check preview, nothing saved) · `POST /strikes` (save; reuses the preview's policy result kept 10 min on the server, else runs it again) · `POST /commendations` · `GET /given` (what you gave) · `GET /appeals` (appeals you may decide) · `POST /appeals/{strike_id}/decision` (uphold / dismiss) · `POST /strikes/{strike_id}/appeal` (receiver, once, from the dashboard). Dashboard `my_strikes` gains `can_appeal` + appeal/review fields; the policy check moves from `agent/actions.py` into `services/strikes.py`. Defaults: "given" = only what you gave; no review note (no column); reviewers see policy passages only from documents they can see. Order: A options + context flag · B give · C appeals, reviews, lists · D frontend connection + brief.
- **Built 2026-10-15 (part A):** `schemas/feedback.py`, `services/feedback.py::feedback_options` / `feedback_tabs`, `GET /api/v1/feedback/options`; `ActiveOrgPermissions.feedback_tabs` on `/auth/context`; `strikes` removed from `admin_tabs` (frontend `nav-items.tsx` Strikes link removed, breadcrumb label `feedback`); `openapi.json`, `v1.d.ts`, zod regenerated; `tsc` clean. Offline check 5/5 with made-up teams (manager → strike + commend, senior without permissions → commend only, bottom of team → nothing, HR with org `review_strike` → appeals only, team-level reviewer → appeals). **Live-checked against Neon 2026-10-15, 24/24** (all 4 members of org "Trellis", via `check_feedback_a.py`): `feedback_tabs` on `/auth/context` = `/feedback/options` tabs; no `strikes` admin tab; nobody listed for themselves; every pick passes `check_give_strike` / `check_give_commendation`, and nobody the save rules allow is missing. Admin → strike + commend + appeals (1 person each); Student Test → appeals only; Jayant and TEST-Employee → no Feedback link.
- **Built 2026-10-15 (part B):** the policy check moved from `agent/actions.py::_policy_check` to `services/strikes.py::check_policy` (+ `evaluation_text`), used by both chat and the page; chat behaviour unchanged. `preview_strike` / `save_strike` (preview result kept 10 min in an in-process `TTLCache` keyed by giver, team, person and exact reason; Save without a matching preview checks the rules first, then the policy once). Routes `POST /feedback/strikes/check` → `StrikePreviewResponse` (team, person, active count, `will_escalate`, `policy: PolicyCheck`), `POST /feedback/strikes` → 201 `StrikeResponse`, `POST /feedback/commendations` → 201 `CommendationResponse`. Types regenerated, `tsc` clean. **Live-tested 18/18** (TEST-fb rows removed after): preview 200 with verdict and passages, saves nothing; save after preview makes 0 extra AI calls and keeps the verdict + passage ids; save without preview checks once; commendation 201; refused: strike/commend yourself (403), 4-letter reason (422), TEST-Employee striking or commending the Admin (403); chat's give_strike card still gets its policy check.
- **Built 2026-10-15 (part C):** `StrikeResponse` gains `appeal_notes`, `reviewed_by_name`, `reviewed_at`, `can_appeal` (so the dashboard's `my_strikes` carries the Appeal flag); new `AppealResponse` (+ `policy_evaluation`, `policy_sources` = saved passages filtered by `services/documents.py::visible_chunks`), `AppealStrikeRequest` (note 5–1000 chars), `ReviewAppealRequest` (`uphold` | `dismiss`), `GivenFeedbackResponse`. `FeedbackTab` moved to `schemas/auth.py` (import loop). Services: `strikes.list_given_strikes`, `list_reviewable_appeals` (oldest first; D6 + D55), `appeal_strike` (404 not yours, 409 `cannot_appeal`), `review_appeal` (404 without `review_strike` for the team, 403 giver or receiver, 409 `not_appealed`), shared `_strike_query` / `_to_response`; `commendations.list_given_commendations`. Routes `GET /feedback/given`, `GET /feedback/appeals`, `POST /feedback/appeals/{id}/decision`, `POST /feedback/strikes/{id}/appeal`. Types regenerated, `tsc` clean. **Live-tested 24/24** (TEST-fbc rows removed after): given list; dashboard Appeal flag on, then off after appealing and after review; one appeal only (409); short note / unknown decision (422); someone else's strike (404); employee has no appeals list and can't decide (404); giver can't decide (403); reviewer sees the note, the saved verdict and the passages she can see; D55 receiver-reviewer neither sees nor decides her own (403); uphold records the reviewer; deciding twice (409); dismissed strike leaves the dashboard.
- **Built 2026-10-15 (part D, frontend connection):** `lib/api/queries/feedback.ts` (`getFeedbackOptions`, `getGivenFeedback`, `getAppeals`), `lib/api/actions/feedback.ts` (`checkStrike` under the `heavyRead` limit since it's an AI call; `giveStrike`, `giveCommendation`, `appealStrike`, `decideAppeal` under `write`; each `safeParse`s the generated schema), `lib/api/schemas/feedback.ts` (`zGiveFeedbackForm` with a frontend-only `kind`, `zAppealForm`), sidebar "Feedback" link from `feedback_tabs`. `tsc` + eslint clean. The page (part E) is built by Piyush + Claude, no teammate brief.
- **Page layout (Piyush, 2026-10-15):** tabs **Give** · **Given by you** · **Appeals to review**. *(Refines the three tabs above: "Give a strike" and "Give a commendation" become one Give tab with a Commendation / Strike switch; the Strike side shows only with `give_strike`, so the visibility rules are unchanged.)* Appeals are full cards with Uphold / Dismiss, no drawer. The dashboard's Appeal button is added to the teammates' strikes card once their dashboard page exists. Details: frontend-scaffold `spec.md`.
- **Built 2026-10-15 (part E, step 1):** `/feedback` page, tabs (shadcn Tabs; `?tab=` via `history.replaceState`), Give tab (switch, pickers, commendation confirm dialog, strike Check policy → policy box + escalation line → Confirm). Feedback keeps its own `policy-check-box.tsx` / `source-badge.tsx` (Piyush: not shared with chat). Checked in the in-app browser as Admin: commendation and strike saved as expected, test rows removed.
- **Built 2026-10-15 (part E, step 2):** Given by you list and Appeals to review cards; deciding an appeal is an instant change (D50: the card leaves at once, comes back with a toast if refused). Browser-checked as Admin with seeded test strikes (removed after): every status label, the saved policy check on the cards, uphold, dismiss, and a refused decision rolling back. **The /feedback page is complete.** Left: the dashboard's Appeal button, once the teammates' dashboard page exists.
- **Written into:** map, frontend-scaffold map, tickets 01/06, `spec.md`.

### D55. Can someone review the appeal of a strike they received? (added 2026-10-15, Feedback part C) — ✅ RESOLVED 2026-10-15
- **Gap:** D6 excludes only the **giver** from reviewing an appeal. A reviewer (e.g. HR with org-wide `review_strike`) who receives a strike on a team could appeal it and then dismiss it themselves.
- ✅ **Decision (Piyush): no.** Neither the giver nor the receiver may decide an appeal. If no one else has `review_strike` for that team, the appeal waits (same as D6's gray area).
- **Written into:** D6 (note), D54 part C, map.

### D56. The chat presents a partial document list as someone's full access (added 2026-10-15, found from Piyush's chat test) — ✅ RESOLVED 2026-10-15
- **Gap:** D53's rule works (TEST-Employee asking about Jayant got the 5 documents both can see; Jayant's manager/consultant documents stayed hidden). But the answer said "Here are the documents that Jayant can see", which reads as his full access. The tool prompt only says "say so if it matters", so the model skipped the "only documents you can also see" caveat.
- ✅ **Decision (Piyush): always add the note.** `get_person_documents` starts every result (also the empty one) with `PERSON_DOCUMENTS_NOTE`: only documents the user can also see are listed; this person may have access to others. Same wording for everyone, so it never hints whether anything is hidden. The read-agent prompt says to always pass it on. Rejected: "full list" wording for people below you (more code, little gain).
- **Built 2026-10-15:** checked in-process as TEST-Employee about Jayant → note + the same 5 documents. Backend tests: all 58 pass (the stale `test_context_team_permission_does_not_open_admin` was fixed the same day: its fake database predated the Feedback-tabs lookup in `/auth/context`, now stubbed like the test's other lookups).
- **Written into:** D53 (note), map.

### D57. How do we measure the chat's answer quality? (added 2026-10-16, raised by Piyush) — ✅ RESOLVED 2026-10-16
- **Gap:** the map listed a "Scoring & Evaluation Suite" as not yet specified, and nothing measured how good the read path's answers are. `deepeval` had been removed on 2026-10-09 (D7) because nothing used it.
- ✅ **Decision (Piyush): a DeepEval run in `backend/evaluation/`** scoring Context Relevancy, Context Precision, Context Recall, Faithfulness and Answer Relevancy on 10 read-path questions from `plans/documents/test-files` (all 5 file types; asked as real TEST-Employee, TEST-Manager and TEST-HR members with their real scope). Expected answers come from that README, checked against the documents.
  - **Two steps** so a free-tier rate limit never wastes work: `run_agent.py` saves answers + retrieved parts to `results/answers.json`; `score.py` scores that file into `results/scores.json` and `results/report.md`. Both skip what's already done.
  - ~~**Judge: Gemini Flash (`gemini-3.6-flash`, pinned), not the agent's Flash-Lite**, so the agent doesn't grade itself and the judge has its own free quota.~~ *Superseded the same day:* Flash's free tier allows only ~20 requests a day (see "Which AI powers the chat", 12 October) and a run needs ~200 judge calls; it also kept returning 503 "high demand".
  - ✅ **Judge: Flash-Lite pinned to `gemini-3.5-flash-lite` (Piyush, 2026-10-16).** Fits the free daily limit (~500–1,000). It is the model the agent's `gemini-flash-lite-latest` pointed to that day, so the agent is graded by its own model; accepted because DeepEval splits each score into small yes/no checks against the document text, and the report says so. Rejected: another provider (new account + key), Flash spread over ~10 days.
  - One judge call at a time, 7 s apart; waits a minute and retries (up to 5 times) when Gemini says it's overloaded (503). Checked 2026-10-16 on a made-up answer: all 5 metrics scored with sensible reasons.
  - `deepeval` re-added as a **dev-only** package (`uv add --dev`), not in `requirements.txt`. No app code changed.
  - Left out: the README's "must NOT be answered" questions (permission checks, not answer quality). Red-teaming / prompt-injection testing stays unspecified.
- **First run 2026-10-16** (all 10 scored): averages Context Relevancy 0.13 (low by design: 6 parts per search), Context Precision 0.75, Context Recall 1.00, Faithfulness 1.00, Answer Relevancy 1.00. Every search found the right document; weak spot is ranking (#4, #5, #7 had the answer part 3rd). The employee test account's org role is now `TEST-Employee2` (under TEST-HR, created 2026-10-14); it still holds TEST-Employee on TEST-Alpha, so `run_agent.py` falls back to team roles.
- **Offline splitting test 2026-10-16** (`evaluation/compare_splits.py`, marker-based, no judge; today's split scores 0.75 there too): cutting at headings with "title > section" on each piece ranked the answer 1st in 9/10 (today 6/10), precision 0.93 vs 0.75, ~1,100 vs ~4,200 characters sent per question (4 vs 6 pieces), answer still found 10/10. Merging small sections gave part of the gain back (8/10). Parent-child (search the heading pieces, return blocks of whole sections up to ~1,000 chars) ranked 10/10 first, precision 1.00, ~2,500 chars with 3 returned (heading pieces + titles: 9/10, 0.93, ~860 chars). More pieces cost little: embedding is priced by text, and heading cuts embed about the same text as today. Decided as D58 (heading-wise, ~200 minimum, 4 pieces); not built.
- **Improvement options** (none built yet) are in `backend/evaluation/results/improvements.md`; recommended first: 500-character pieces with title + section in each, then rerun.
- **Written into:** map ("Decisions so far" + "Not yet specified"), `backend/CLAUDE.md` folder map.

### D58. How documents are cut into pieces for search (added 2026-10-16, from the D57 evaluation) — ✅ RESOLVED 2026-10-16 (plan; not built)
- **Gap:** the first evaluation (D57) scored Context Precision 0.75 and Context Relevancy 0.13. Ticket 11's 1,000-character cuts (200 overlap) pack several short sections into one piece (the manager playbook's "Blocked tasks" shared a piece with 4 other sections), so the right part often ranked 3rd, and 6 pieces of ~1,000 characters per question send a lot of unrelated text.
- **Tested offline** (`backend/evaluation/compare_splits.py`, marker-based, no judge; today's split scores 0.75 there too): a piece per heading with "title > section" ranked the answer 1st in 9/10 (today 6/10) with ~1/4 of the text; merging sections up to 400 characters gave part of it back (8/10); parent-child ranked 10/10 but sends ~3x the text.
- **Cost check:** the free embedding quota is **1,000 pieces a day per project, and every piece in a batch counts** (Google's 429 on 2026-10-16), so piece count matters on the free tier; a piece per heading would make 79 pieces for the 12 test documents vs 28 today. The 1,024-dim vectors are fine: dimensions don't change quota or price, only storage (~4 KB per piece).
- ✅ **Decision (Piyush): heading-wise pieces with a ~200-character minimum, search returns 4 pieces.** 51 pieces for the test documents (median ~390 characters). Decided without measuring this exact variant (expected between 8/10 and 9/10).
  - Ingestion: Word heading styles kept as `## ` markers; split at Markdown `#`, Word headings, numbered lines in PDF/txt; join sections under ~200 characters to a neighbour; cut sections over 1,000 with the recursive splitter; prefix "Document title > Section"; no headings → today's 1,000/200 cuts. Slides unchanged. No database change.
  - Retrieval: `search_chunks` default k 6 → 4 (chat). The strike policy check keeps its own `POLICY_PASSAGES`.
  - Then: re-index existing documents (one-off script; old pieces stay until re-processed; ~51 embeddings for the test docs), rerun the D57 evaluation.
  - Rejected: piece per heading with no minimum (too many pieces for the free quota), parent-child (more text to the agent, no fewer embeddings), smaller fixed cuts.
- **Written into:** ticket 11 §5 (planned change), map, "Code drift" below, `backend/evaluation/results/improvements.md`.

### D59. Documents on tasks: handing in work, reference files, or both? (added 2026-10-17, raised by Piyush after the tasks pages shipped) — ✅ RESOLVED 2026-10-17 (built 2026-10-17)
- **Gap:** the first tasks round (D32/D33, 2026-10-10) was core only; "submissions" were left for a later round. The `task_submissions` table (ticket 02, initial migration) is one-way: the person doing the task uploads finished work (`file_url`, `notes`). Nothing decides whether managers can also attach reference files (e.g. a template) when creating a task.
- ✅ **Decision (Piyush): handing in work only.** The person doing the task uploads their finished work with an optional note; reference files from the manager are not part of this round (a link in the description covers it). Uses the existing table (no migration) and the same UploadThing setup as Admin → Documents. Submissions are not policy documents: they never reach the AI chat's search (D34 clarification).
- ✅ **(a) Who can open a handed-in file (Piyush, 2026-10-17): the person who handed it in and the task's managers** (`can_manage_task`, the same check behind `can_edit`). Teammates still see the task and its status, not the file (same idea as D24's strike counts). Rejected: anyone who can see the task.
- ✅ **(b) Repeat hand-ins (Piyush, 2026-10-17): several, kept as history, newest first.** Each hand-in is one file + an optional note (one `task_submissions` row). The person who handed it in can delete their own hand-in (the file is removed from UploadThing too, like documents); managers can't delete it; deleting the task clears its hand-ins. Rejected: one file that each new hand-in replaces.
- ✅ **(c) Status (Piyush, 2026-10-17): handing in doesn't change it.** The hand-in only saves the file and note; the status changes through the existing dropdown (D33 rules unchanged). Rejected: handing in marks the task Done.
- ✅ **(d) Files (Piyush, 2026-10-17): everyday work files, one per hand-in, up to 16 MB** (same size as documents): PDF, Word, Excel, PowerPoint, PNG/JPG, plain text. No zips or programs. A separate UploadThing route from `policyDocument`, gated to the task's assignee. Rejected: any file type.
- ✅ **(e) Searchable by the AI chat? (raised by Piyush, 2026-10-17): no, not this round.** Embedding under team access would let teammates read a hand-in through chat while (a) hides the file (team documents are searchable by the team and every role above it, ticket 11). Embedding for "hander + managers" only would need a new access kind in document search (beside org/role/team): possible later round. Also: ingestion reads only PDF/Word/PowerPoint/text, and every piece counts against the free 1,000-a-day embedding quota (D58).
- **Implementation note (2026-10-17):** `task_submissions` has no file-name column, and an UploadThing URL ends in a key, not the name; showing "Q3-report.pdf" needs one small migration adding `file_name` (and `file_size`). The earlier "no migration" was for the table itself.
- **Written into:** map, `plans/task-submissions/`.
- **Built 2026-10-17 (backend, part A):** migration `b7e3d5a9c142` (`file_name`, `file_size`, index; applied to dev); `GET/POST /api/v1/tasks/{id}/submissions`, `DELETE …/submissions/{sid}`, `GET /api/v1/tasks/{id}`; `TaskResult` gains `can_submit`, `can_view_submissions`, `submission_count`. Live-tested 25/25. **Frontend plumbing (B) built the same day:** UploadThing route `taskSubmission` (gate: `can_submit` from `GET /api/v1/tasks/{id}`), `actions/tasks.ts` load/create/delete hand-ins, `deleteTask` removes hand-in files, shared `lib/api/storage.ts`, `zHandInForm`. **Hand-ins dialog (C) built by Claude the same day** at Piyush's request (`tasks/_components/submissions-dialog.tsx`, "Hand-ins (n)" button in `task-data-table.tsx`); manager view checked in the browser; a real upload and delete as TEST-Employee confirmed by Piyush the same day. **Hand-ins complete.**

### D60. Comments on a task: who reads and writes, and how they work (added 2026-10-17, raised by Piyush after hand-ins) — ✅ RESOLVED 2026-10-17 (plan; not built)
- **Already settled:** called **Comments**, shown inside a task, never a page (D41). Table `task_comments` (ticket 02: task, author, text, time; deleted with the task). Ticket 02's index `idx_task_comments_task (task_id, created_at)` was never created: one small migration.
- ✅ **(a) Who reads and posts (Piyush, 2026-10-17): anyone who can see the task** (same `_get_task_row` visibility as the task: team members and people who oversee the team, D13). Comments are team coordination on the task, unlike hand-ins (D59), which are one person's work record. Rejected: assignee + managers only.
- ✅ **(b) Editing and deleting (Piyush, 2026-10-17): the author can edit and delete their own comment; nobody else can** (managers included). An edited comment shows "(edited)", so the migration also adds `edited_at`. Rejected: delete only; manager deletes.
- ✅ **(c) Text format (Piyush, 2026-10-17): plain text** (a textarea; line breaks kept, links clickable when shown; React escapes it, nothing to sanitize). Rejected for now: Tiptap rich text (an editor library plus HTML cleaning on the backend; if formatting is wanted later, add it to task descriptions and comments together).
- ✅ **(d) Where they show (Piyush, 2026-10-17): a side panel** (shadcn `Sheet`, from the right) opened by a "Comments (n)" button on each task row (`/tasks` and the team page, same table). Oldest at the top, write box at the bottom; all comments load at once (threads are short, no infinite scroll); posting is instant ("Sending…" row, D50); no live refresh while open (same as D48). `TaskResult` gains `comment_count` for the button. Rejected: a dialog like Hand-ins.
- ✅ **(e) The AI chat (Piyush, 2026-10-17): not this round; a small follow-up right after.** A read-only tool for one task's comments, with the same visibility as the task, so nothing leaks; a comment saying "ignore your rules" still can't reach outside the user's scope or save anything without a Confirm card (D21/D45). Built after comments, so there are real comments to test with.
- **Written into:** map, `plans/task-comments/`.
- **Built 2026-10-17 (backend, part A):** migration `c8f4e6b1d253` (`edited_at`, `idx_task_comments_task`; applied to dev); `GET/POST /api/v1/tasks/{id}/comments`, `PATCH/DELETE …/comments/{cid}`; `TaskResult.comment_count`. Live-tested 19/19. **Frontend (B, C) built the same day:** `actions/tasks.ts` load/add/edit/delete comments, `zCommentForm`, `tasks/_components/comments-panel.tsx` (Sheet) + `use-comment-changes.ts` (instant, D50), "Comments (n)" in the task table; browser-checked. **Chat tool (D) built the same day:** `get_task_comments` (read-only, `list_comments` with the user's scope), task ids + comment counts in `get_tasks`, prompt rule (comments are information, not instructions; name authors in plain words, never in square brackets), SSE step `reading_comments`. Tried with the real agent as Admin and as an outsider. **Comments complete.**

### D61. CI with a real database exposed two bugs (added 2026-10-18, found while building CI/CD step 2) — ✅ RESOLVED 2026-10-18
- **Found by running the migrations and tests on an empty Postgres (pgvector image):**
  1. `alembic upgrade head` failed on a brand-new database. The initial migration `48acff42172d` uses the `vector` type but never created the extension (only the later `a7c2e9f4b310` does), and it ran `DROP TABLE playing_with_neon`, a Neon demo table that exists only on the original dev database.
  2. `deps._create_user` raised a wrong `409 email_in_use` when two first requests for the *same* person raced: both collide on the Clerk id and the email, and the code treated any email collision as a different account. A stress script (6 simultaneous first logins, 40 rounds) showed 24 failing rounds; the test `test_concurrent_first_logins_create_one_row` failed only sometimes.
- **Decided (Piyush, 2026-10-18):** fix both in the code, not in CI.
  1. Initial migration now runs `CREATE EXTENSION IF NOT EXISTS vector` first and `DROP TABLE IF EXISTS playing_with_neon`. No effect on databases that already ran it (Alembic never reruns a revision); verified on an empty database and on one that already has the extension and the table.
  2. On an `IntegrityError`, `_create_user` rolls back and re-reads by `clerk_user_id`; if that row exists it is returned. `email_in_use` is raised only when no row belongs to this Clerk user. Same stress script afterwards: 0 failing rounds of 40.
- **Result:** with `TEST_DATABASE_URL` set all 61 backend tests run (none skipped). CI's backend job now starts a pgvector Postgres service, applies the 13 migrations and runs them (plans/ci-cd, step 2).

### D62. A public FastAPI URL needs a shared secret (added 2026-10-18, found while planning the first deploy) — ✅ RESOLVED 2026-10-18 (built 2026-10-18)
- **Conflict:** D27 and the D11 note say FastAPI must stay unreachable from outside, because Arcjet's limits and bot checks live only in the Next.js server. Deploying the frontend on Vercel and the backend on Render (CI/CD step 3, `plans/ci-cd/`) gives FastAPI a public address.
- **Example:** a signed-in employee finds the backend address and sends hundreds of chat messages straight to it. The Clerk token still limits what they can read, but they skip the 5-messages-a-minute limit and burn the org's shared free Gemini quota.
- **Decided (Piyush, 2026-10-18):** keep the rule's intent with a **shared secret**. The Next.js server sends `X-Internal-Key: <secret>` on every call to FastAPI, and FastAPI refuses every `/api/v1` request without the matching value (`403 forbidden`) before it looks at the token.
  - Setting `INTERNAL_API_KEY` on both sides (Render and Vercel env vars, never `NEXT_PUBLIC_`). Empty means the check is off, so local development and the tests stay as they are. In production (`ENVIRONMENT=production`) the backend refuses to start without it, so a forgotten variable can't silently open the API.
  - This is a deployment gate, **not identity**: the rule that user and org come only from the verified Clerk token (D8) is unchanged, and `X-User-*` / `X-Org-*` stay ignored.
  - `/health`, `/docs` and `/openapi.json` stay open at the root (D3); Render's health check and the deploy smoke test need `/health`.
- **Where:** `backend/app/core/config.py`, `backend/app/core/deps.py`, `backend/app/api/v1/__init__.py`, `frontend/lib/api/client.ts`. No change to `openapi.json` (the check reads the raw request header).
- **Built 2026-10-18:** `INTERNAL_API_KEY` setting plus a production-start check (`config.py`), `require_internal_key` (`deps.py`), wired first on `api_router`, and an `internalKey` middleware in `frontend/lib/api/client.ts`. Five tests in `backend/tests/test_internal_key.py` (missing, wrong and right key, check off when empty, production refuses to start without it). `openapi.json` unchanged. Still to do at deploy time: generate a value and set it on Render and Vercel (CI/CD step 3).
- **Source tickets:** closes the "known gap" note on Arcjet guarding only the Next.js door (D27, line below D11).

### D63. Which Clerk keys the online demo uses (added 2026-10-18, raised while planning the first deploy) — ✅ RESOLVED 2026-10-18
- **Question:** Clerk offers development keys (`pk_test_` / `sk_test_`) and production keys (`pk_live_` / `sk_live_`). Production needs a domain we own with DNS records, starts with no users or orgs (nothing is copied from development), needs our own OAuth credentials for social sign-in, and our Neon rows (`clerk_user_id`, `clerk_org_id`) would no longer match any account. Development instances are not meant for real production use (Clerk docs) and an older Clerk page mentions a 500-user cap (not re-checked).
- **Decided (Piyush, 2026-10-18): development keys for the online demo**, on the `*.vercel.app` address. It is a student demo, and it keeps the existing test accounts, orgs and Neon data.
  - The online app therefore uses the same Neon database as local development (the data is tied to the development Clerk instance).
  - To set at deploy time: backend `CLERK_AUTHORIZED_PARTIES` = the Vercel origin (JSON list) and `FRONTEND_URL` = the Vercel URL; Clerk dashboard allowed redirect/origin list gets the Vercel URL if the first sign-in asks for it. Not yet verified that a development instance works on a `*.vercel.app` address; the first deploy will show.
  - Revisit if we get a real domain: swapping to production keys is a deployment change plus a fresh database, not a code change.
- **Clarified 2026-10-18 (Piyush):** the development keys are the teammate's shared Clerk application (frontend-scaffold ticket 04, decided 2026-10-08), not Piyush's own. Piyush added himself as a member of that Clerk dashboard so he can edit its settings. An own Clerk app plus a fresh Neon database was considered and not chosen; it stays the fallback if the shared app ever goes away (the first-login email clash on a reused database is why a new Clerk app would need an empty database).
- **Live addresses (2026-10-18):** backend `https://trellis-uttr.onrender.com`, frontend `https://trellis-tau-three.vercel.app`. Backend `CLERK_AUTHORIZED_PARTIES` and `FRONTEND_URL` point at the Vercel address.

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
- `backend/app/services/ingestion.py` (`_extract_text`, `_chunk_text`) and `services/documents.py` (`search_chunks` k=6): still 1,000-character cuts and 6 pieces; D58 (2026-10-16) plans heading-wise pieces with a ~200-character minimum and 4 pieces. Not built.
- ~~`backend/app/api/v1/auth.py::_admin_tabs` and `schemas/auth.py` `admin_tabs`: still include `"teams"`; D28 (2026-10-10) dropped the admin Teams tab.~~ Fixed 2026-10-10 (teams slice A; `openapi.json` and `v1.d.ts` regenerated).
- ~~`backend/app/core/config.py`: no LLM settings.~~ Fixed 2026-10-09: `GOOGLE_API_KEY`, `CHAT_MODEL` (`google_genai:gemini-flash-latest`), `ROUTER_MODEL` (`google_genai:gemini-flash-lite-latest`), `CHAT_MAX_MESSAGE_CHARS=4000` (D7, D21).
- ~~`backend/app/agent/state.py`: old 3-way `intent`, LLM groundedness field, no `pending_action`, no per-turn reset.~~ Fixed 2026-10-09: rewritten for D19–D22; adds `AgentContext` and `new_turn_input()`.
- ~~`backend/app/models/document.py` docstring: the same inverted "descendant" wording as ticket 02.~~ Fixed 2026-10-08.
- ~~`backend/app/models/role.py` permission comment: missing `review_strike`.~~ Fixed 2026-10-08 (migration `d4e8b2a61f07` commit).
- ~~`backend/app/core/config.py` `async_migrations_url` and `alembic/env.py`: both use the **pooled** URL.~~ Fixed 2026-10-08: `async_migrations_url` now always uses the direct `DATABASE_URL`.
- Migrations: **document search indexes added 2026-10-09** (`a7c2e9f4b310`: `CREATE EXTENSION IF NOT EXISTS vector`, HNSW `vector_cosine_ops`, chunk scope indexes, `documents (org_id, created_at)`); task, comment, chat-session and audit indexes still come with those features. Earlier: **partly fixed 2026-10-08.** `d4e8b2a61f07` adds `idx_org_members_role`, `idx_invitations_pending`, `idx_team_members_user` and `idx_roles_org_parent`. Still missing: the remaining ticket 02 indexes (HNSW `vector_cosine_ops`, chunk scope indexes, tasks, comments, chat sessions, audit), planned as ticket 11's indexes migration. There is also no `CREATE EXTENSION IF NOT EXISTS vector`.
- ~~`backend/app/services/ingestion.py`: no retry, no failure reason, reuses the request's session.~~ **Fixed 2026-10-08.** The rework also covers the SSRF guard, the atomic commit, extraction off the event loop, and the stale-job sweep (see ticket 11 §7a). ⚠️ Migration `c3f1a9d27e54` must be applied.
- ~~`backend/app/main.py`: still opened the SQLite checkpointer (`AsyncSqliteSaver`, `CHECKPOINTS_DB_PATH`) after D11.~~ Fixed 2026-10-12 (chat effort slice A): `AsyncPostgresSaver` on a psycopg pool (direct URL), `setup()` at startup, agent built once on `app.state.agent`; `langgraph-checkpoint-sqlite` and `checkpoints.db` removed. Migration `e2a7c4d9b613` adds `audit_log.injection_suspected` (D21) and the chat-list / audit indexes from ticket 02.
- ~~`backend/app/api/v1/auth.py::_admin_tabs`: the `strikes` tab checks only `can_org("review_strike")`, not team-level `review_strike` (D6).~~ Fixed 2026-10-15 (D54 part A): `strikes` left `admin_tabs`; `feedback_tabs` counts team-level reviewers.
- Scope cache: no invalidation on re-parenting yet (nothing is implemented yet).
- Repo hygiene:
  - ~~`backend/**/__pycache__/*.pyc` files are tracked in git.~~ Fixed 2026-10-08: they are untracked, and `backend/.gitignore` is corrected (its paths were prefixed with `backend/`, so nothing matched).
  - The frontend has both `package-lock.json` and `pnpm-lock.yaml`; `packageManager` is pnpm.
- The PRD still says the scope cache is "Redis, TTL ~60s". Ticket 03 replaced that with an in-process `TTLCache` with a 5-minute TTL.
- ~~**Frontend review 2026-10-11 (admin console, commit 390608c):** leftover `admin/documents/` (broke `next build`), missing `admin/page.tsx`, no role edit/delete.~~ Fixed 2026-10-11 by Claude (frontend-scaffold ticket 06 §4); also fixed `lib/api/client.ts`/`errors.ts` swallowing Next's dynamic-rendering signal. Documents then moved back to `/admin/documents` (D37).
