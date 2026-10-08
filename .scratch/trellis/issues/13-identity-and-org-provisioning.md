# 13 - Identity Pipeline, Org Provisioning & Admin Access (Implementation)

- **Type**: `task`
- **Status**: `ready-for-agent`
- **Assignee**: Backend Dev (backend) + Frontend Dev (onboarding page, admin gate)
- **Blocked by**: 12 (D4, D8, D9, D10 resolved; **D13 team visibility still open**, see the note in step 3)

## Goal

Implement the decisions locked in ticket 12 D4, D8, D9 and D10:
- Clerk proves identity.
- The Trellis DB decides permissions.
- New orgs are provisioned synchronously.
- Invitations are applied just-in-time.
- The admin console is gated by Trellis permissions.

**Design references:**
- Ticket 03: §1 `AccessScope`, §2 identity pipeline, §3 queries, §4 invalidation, §5 dependency chain.
- Ticket 02: schema additions.
- Ticket 05: endpoints and schemas, item 7.
- Frontend tickets 02, 03, 04 and 06.

---

## Current code (PR #8, merged 2026-10-08)
The teammate's PR #8 already added `backend/app/core/auth.py` (JWT verification), `backend/app/core/deps.py` (`get_current_user`, `get_scope`, `require_org_scope`) and `backend/app/scope/resolver.py`. **Extend these files; don't create a parallel `app/auth/` package.** The checklist below refers to responsibilities, not new file names.

- **Already fixed** (branch `fix/config-restore-and-resolver`): the resolver runs its queries sequentially (an `AsyncSession` can't run concurrent queries), `AccessScope` is frozen, `in_team()` exists, and the CTE uses `UNION`. The settings the merge dropped are restored in `config.py`.

## ✅ Done 2026-10-08 (branch `fix/auth-hardening`): `auth.py` / `deps.py` (approved 2026-10-08, independent of D15 and the D9 migration)

> **Outcome:** A1–A6 and B1–B4 are implemented, with errors in the D16 shape (`app/core/errors.py`). Tests live in `backend/tests/` (`uv run pytest`); the real two-logins race test runs only when `TEST_DATABASE_URL` points at a migrated Neon branch.
> **Deviations and additions:**
> - A1: a token *without* `azp` is accepted (same rule as Clerk's SDKs); a present-but-unknown `azp` → 401.
> - A4: an unknown `kid` stays a 401; only an unreachable JWKS endpoint → 503.
> - B1: an email that already belongs to a different Clerk user → 409 `email_in_use`.
> - A missing `Authorization` header → 401 `invalid_token` in the D16 shape.
> - A2 still needs one real token to confirm the claim format (frontend slice E).

**`auth.py`**
- **A1** `azp` check against a new `CLERK_AUTHORIZED_PARTIES: list[str]` setting (default `["http://localhost:3000"]`; set the production origin in `.env`).
- **A2** Org claims: read v2 `o.id` / `o.rol` first, falling back to v1 `org_id` / `org_role`. Confirm the format with one real token.
- **A3** `leeway=5`; require `sub`, `exp`, `iat`, `nbf` and `iss`.
- **A4** `PyJWKClientError` (Clerk's key endpoint unreachable) → 503, not an uncaught 500.
- **A5** JWKS fetching is synchronous and blocks the event loop: call `verify_clerk_jwt` via `asyncio.to_thread` from `deps.py`.
- **A6** Generic 401 detail (log the reason instead of returning `Invalid token: {exc}`); normalize a trailing `/` in `CLERK_ISSUER`.

**`deps.py`**
- **B1** First-login race: `INSERT … ON CONFLICT DO NOTHING`, then re-select. Today two concurrent first requests cause an `IntegrityError` and a 500.
- **B2** Use the Clerk **primary** email (`primary_email_address_id`), not `email_addresses[0]`. Invitations are matched by email (D10).
- **B3** No email → 400 "an email address is required" (today it stores `""`, so the second email-less user collides on the unique email).
- **B4** `httpx` network errors calling Clerk → 503 (today they're uncaught).

**Verification:** test RS256 keys + a fake JWKS. Cover: valid token; wrong `azp`; expired; wrong `iss`; bad signature; v1 and v2 org claims; JWKS down → 503; two concurrent first logins → one row. No calls to Clerk or Neon.

**Deliberately NOT in this fix:**
- An unknown org currently returns an empty scope with a sentinel `org_id = UUID(int=0)` instead of 409 `org_not_provisioned`. **D15 resolved 2026-10-08 (D10/D4 kept):** step C replaces it with 409.
- Org-level role, `can_org`, and creating `org_members` just-in-time (needs this ticket's migration, D9 and D10).
- Kept: PR #8 fetches email and name from the Clerk Backend API once per user instead of D8's custom claims. That's equivalent, so no change.

---

## Checklist

### 1. Config (`backend/app/core/config.py`)
- [ ] Add `CLERK_ISSUER`, `CLERK_JWKS_URL`, `CLERK_AUTHORIZED_PARTIES: list[str]`, `CLERK_SECRET_KEY`.
- [ ] Frontend ticket 04 checklist done: custom `email`/`name` session claims, self-serve org creation, and the org claim format (v1 or v2) recorded from a real token.

### 2. Migration (Alembic, one revision)
- [x] `org_members.role_id` (nullable FK → `roles.id`).
- [x] `roles.is_system` (bool, `server_default false`).
- [x] `invitations.clerk_invitation_id` (nullable, unique).
- [x] Indexes from ticket 02:
  - `idx_org_members_role`
  - `idx_invitations_pending` (partial)
  - the corrected `idx_team_members_user`
- [x] Update the SQLAlchemy models: `organization.py` (`OrgMember.role_id`), `role.py` (`is_system`, plus `review_strike` in the comment), `invitation.py`.
- [x] **Related drift fix (ticket 12 "Code drift"):** Alembic must use the **direct** (unpooled) URL.
- **Done 2026-10-08:** migration `d4e8b2a61f07` (revises `c3f1a9d27e54`). It also adds `idx_roles_org_parent` for the role-tree walk. `idx_team_members_team` is skipped because the `UNIQUE (team_id, user_id)` constraint already serves it. The FK `org_members.role_id` uses the default ON DELETE (restrict), so a role that someone holds cannot be deleted. **Not yet applied to Neon:** run `uv run alembic current`, then `uv run alembic upgrade head`.

### 3. Auth package (suggested: `backend/app/auth/`)
- [ ] `claims.py`: `verify_clerk_jwt`. Check RS256, `iss`, `azp`, `exp`, `nbf` and `sub`, with leeway ≤ 5 s. Parse the v2 org claim with a v1 fallback. Return 401 on any failure.
- [ ] `identity.py`: `get_identity`, a just-in-time upsert of `users` by `clerk_user_id`.
- [ ] `org_context.py`: `get_org_context`.
  - Map the Clerk org ID to `organizations.id` (cached); return 400 `no_active_org` or 409 `org_not_provisioned` as appropriate.
  - Create the `org_members` row just-in-time.
  - Apply pending invitations, then `invalidate_scope`.
- [ ] `scope.py`: `AccessScope` (frozen, with `org_permissions`, `in_team`, `can`, `can_org`), `resolve_scope` (queries A, B and C via `asyncio.gather`), the `TTLCache`, and `invalidate_scope` / `invalidate_org`.
  - **Before writing `allowed_team_ids`, check ticket 12 D13.** If it's still open, implement membership-only teams and leave a `TODO(D13)`.
- [ ] `guards.py`: the hierarchy helpers.
  - `highest_role(scope)`.
  - `is_strictly_below(role_id, caller_roles)`, using the role tree.
  - `assert_can_grant(permissions, scope)`.
  - `assert_not_last_admin(org_id, user_id)`.

### 4. Clerk Backend API client (suggested: `backend/app/services/clerk.py`)
- [ ] A thin `httpx.AsyncClient` against `https://api.clerk.com/v1`, authenticated with `Bearer CLERK_SECRET_KEY`. Needed operations:
  - `get_organization(clerk_org_id)` (for the name)
  - `create_org_invitation(clerk_org_id, email, inviter_clerk_user_id)`
  - `revoke_org_invitation(clerk_org_id, invitation_id, requesting_user_id)`
  - `delete_org_membership(clerk_org_id, clerk_user_id)`
- [ ] Decide between the official `clerk-backend-api` Python SDK and raw `httpx`. Raw `httpx` is enough for 4 calls and avoids another dependency.

### 5. Endpoints (all under `/api/v1`)
- [ ] `GET /auth/me` and `GET /auth/context` (identity-only). `context.active_org` holds the effective permissions and `can_open_admin`.
- [ ] `POST /orgs/provision`: idempotent; requires Clerk `org:admin`; one transaction creates the org, the root `Admin` role (`is_system`, 8 permissions) and the creator's `org_members` row with that role.
- [ ] `POST /admin/teams/{team_id}/members`:
  - Already an org member → add to the team directly.
  - Otherwise → create a Trellis invitation, then the Clerk invitation, then store `clerk_invitation_id`.
  - Enforce the privilege-escalation guard.
- [ ] `DELETE /admin/invitations/{id}`: revoke in Clerk, then mark it expired or delete it.
- [ ] `PATCH /admin/members/{user_id}` (`org_role_id`): set the org-level role; enforce the escalation and last-Admin guards; invalidate the scope.
- [ ] `DELETE /admin/members/{user_id}`: Clerk first, then the DB, then invalidation; enforce the escalation and last-Admin guards.
- [ ] Role CRUD guards: protect the `is_system` role; new or edited roles must sit below the caller; the caller can only grant permissions they hold; re-parenting calls `invalidate_org`.

### 6. Frontend
- [ ] `proxy.ts`: signed-in and active-org checks only (frontend ticket 02); public routes include `/`, `/sign-in`, `/sign-up`; **no Clerk-role admin gate**.
- [ ] `lib/api/client.ts`: Bearer token only, no `X-*` headers (frontend ticket 03).
- [ ] `/org-selection`: `<OrganizationList hidePersonal afterCreateOrganizationUrl="/onboarding" />`.
- [ ] `(auth)/onboarding/page.tsx`: call `POST /api/v1/orgs/provision`, then `redirect('/dashboard')`. Show a clear message on 403.
- [ ] BFF query helper: on 409 `org_not_provisioned` → `redirect('/onboarding')`; on 400 `no_active_org` → `redirect('/org-selection')`.
- [ ] `(dashboard)/admin/layout.tsx`: `getAuthContext()` → redirect unless `can_open_admin`; per-tab visibility (frontend ticket 06 §0).

### 7. Tests (pytest + httpx `AsyncClient`; generate test RS256 keys and a fake JWKS)
- [ ] **Token checks:** bad signature, wrong `iss`, wrong `azp`, and expired tokens → 401.
- [ ] **Header spoofing:** `X-Org-Id` / `X-User-Id` headers that differ from the token have no effect.
- [ ] **Org lookup:** unknown org → 409; no org claim → 400.
- [ ] **Provisioning:**
  - It is idempotent: calling twice gives one org, one Admin role and one membership.
  - A non-`org:admin` caller gets 403.
- [ ] **Invitations:** a pending invitation is applied on the first request, and the scope reflects the new team.
- [ ] **Privilege escalation is blocked:**
  - creating a role at or above your own;
  - granting a permission you don't hold;
  - assigning a role at or above your own;
  - removing a member at or above you.
- [ ] **Last Admin:** they can't be removed or demoted.
- [ ] **Scope semantics:**
  - `can_org` vs `can`: a team-level `add_member` doesn't open the admin console.
  - The org Admin passes `can(p, any_team)`.

## Out of scope here
- Clerk webhooks (v2 drift repair, ticket 12 D10).
- D13 team visibility (decide first).
- D4 follow-up: widening console entry to any admin-tab permission.
