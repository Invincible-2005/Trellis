# Trellis

Role-aware AI workspace for organizations: your org's knowledge, searchable and scoped to who's asking.

## Core Directives for Agents

### 1. Holistic Project Awareness & Wayfinder Alignment
- **Check the Map First**: Before writing or modifying any code in `backend/` or `frontend/`, you **MUST** consult the Wayfinder map at [`.scratch/trellis/map.md`](file:///d:/Trellis/.scratch/trellis/map.md) and review the relevant tickets under [`.scratch/trellis/issues/`](file:///d:/Trellis/.scratch/trellis/issues/).
- **Protect Architectural Invariants**: Do not write siloed code for a single query or isolated task that contradicts settled decisions (e.g., hierarchical RBAC, `resolve_scope` backend enforcement, SQLAlchemy async patterns, typed OpenAPI contract). Every change must serve the long-term integrity of the whole system.
- **Explain & Confirm Approach Before Coding**: When a user asks to implement a feature or change code in `backend/` or `frontend/`, first explain the technical approach, cite which Wayfinder ticket/invariants it follows, and ask for the user's confirmation before executing file edits.
- **Two maps**: the system map is `.scratch/trellis/map.md`. Frontend work also follows [`.scratch/frontend-scaffold/map.md`](file:///d:/Trellis/.scratch/frontend-scaffold/map.md) and its canonical file tree [`spec.md`](file:///d:/Trellis/.scratch/frontend-scaffold/spec.md).

### 2. Clarify as We Build (decision hub: ticket 12)
- **Open questions live in [`.scratch/trellis/issues/12-decision-reconciliation.md`](file:///d:/Trellis/.scratch/trellis/issues/12-decision-reconciliation.md)**, one `D<n>` item each. Before working on an area, check ticket 12 for open items that touch it.
- **When building exposes a gap or a contradiction** (tickets disagree with each other, code disagrees with a ticket, or nothing decides it), don't silently pick an answer:
  1. Add or extend a `D<n>` item in ticket 12.
  2. Explain it to the user in plain terms, with one recommendation and the reasons.
  3. Take one decision at a time.
- **When a `D<n>` is decided**:
  1. Mark it `✅ RESOLVED <date>` in ticket 12.
  2. Write the decision into the source tickets. Mark superseded text as superseded; don't silently delete history.
  3. Add a one-line pointer under the map's "Decisions so far".
- **Code that drifts from the tickets** is listed in ticket 12 under "Code drift". Fixing it is a `backend/` or `frontend/` change, so the confirmation rule above applies.

### 3. Locked Invariants (details in the cited tickets)
- **Access scope** (ticket 03, D1/D9):
  - `AccessScope` is a frozen value object built only by `resolve_scope()`.
  - It is enforced inside shared data-access functions that require `scope`; REST endpoints and agent tools call the same functions.
  - It is passed to LangGraph via **runtime context** (`context=AgentContext(...)`), **never** stored in `AgentState` and never in LLM tool schemas.
- **Identity** (ticket 03 §2, D8): user and org come **only** from the verified Clerk JWT. The BFF sends only `Authorization: Bearer`; `X-Org-*` and `X-User-*` headers are never trusted. **Clerk proves identity; the Trellis DB decides permissions.** Clerk org roles grant nothing. The one extra header is a deployment gate, not identity: the Next.js server also sends `X-Internal-Key` (shared secret `INTERNAL_API_KEY`) and FastAPI refuses `/api/v1` calls without it (D62).
- **Roles** (D9):
  - A user has an optional **org-level role** (`org_members.role_id`) plus per-team roles. Use `can_org(p)` for org-wide actions and `can(p, team)` for team actions.
  - **No privilege escalation:** users act only on roles strictly below their own and grant only permissions they hold.
  - The root `Admin` role (`is_system`) is protected.
- **Document visibility:** a doc tagged to role R is visible to R **and R's ancestors**. Equivalently, a user sees docs tagged to their role and its descendants.
- **API** (D2/D3):
  - Every FastAPI route is under `/api/v1` (`v1` is a fixed label).
  - Chat is `POST /api/v1/chat/sessions/{session_id}/message`, which returns SSE.
  - The browser never calls FastAPI directly; everything goes through the Next.js BFF.
- **Onboarding** (D10): Clerk org creation → `/onboarding` → `POST /api/v1/orgs/provision`. The Trellis backend is the only writer of memberships. No webhooks in the MVP.
- **Admin console** (D4): `can_org("create_role") or can_org("add_member")`, each tab gated by its own permission, never by a Clerk role.

---

## Agent skills

### Issue tracker

Issues live as local markdown files under `.scratch/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout: one `CONTEXT.md` + `docs/adr/` at root. See `docs/agents/domain.md`.
