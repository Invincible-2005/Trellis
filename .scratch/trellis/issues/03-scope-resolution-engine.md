# 03 - Scope Resolution Engine (`resolve_scope`)

- **Type**: `task`
- **Status**: `resolved`
- **Assignee**: Backend Dev
- **Blocked by**: 02 (resolved)

## Question

How does the backend securely compute, cache, and inject a user's full `AccessScope`
on every protected request — covering data access, team membership, and per-team
permission checks — while guaranteeing instant invalidation when an admin changes roles?

---

## Decisions locked (implement exactly as described below)

### 1. `AccessScope` shape — Option A (single bundled, immutable value object)

> **Updated 2026-10-08 (ticket 12 D1):** frozen dataclass + frozensets + helper methods.
> The previous mutable `@dataclass` with `list`/`set` fields is superseded.

`AccessScope` answers exactly three questions, and nothing else:

| Question | Field | Used by |
|---|---|---|
| Which **documents** can this user read? | `visible_role_ids` (own roles + all descendants) | `search_chunks` WHERE clause |
| Which **teams** does this user belong to? | `allowed_team_ids` | task / team / dashboard queries |
| What can this user **do**, per team? | `permissions_by_team` | team-scoped write actions |
| What can this user **do** org-wide? | `org_permissions` *(added 2026-10-08, ticket 12 D9)* | admin console, org-wide actions |

A user has **one optional org-level role** (`org_members.role_id`) plus **one role per team**
(`team_members.role_id`). The org role's permissions apply in every team; team-role permissions
apply only within that team.

```python
from dataclasses import dataclass, field
from types import MappingProxyType
from typing import Mapping
from uuid import UUID

@dataclass(frozen=True, slots=True)
class AccessScope:
    """Immutable, server-computed access boundary for ONE user in ONE org.
    Built only by resolve_scope(). Never derived from LLM output or request headers."""
    user_id: UUID
    org_id: UUID
    visible_role_ids: frozenset[UUID]
    allowed_team_ids: frozenset[UUID]
    # Values: create_role | create_team | add_member | upload_document |
    #         assign_task | give_strike | view_aggregate | review_strike
    org_permissions: frozenset[str] = frozenset()      # from org_members.role_id
    permissions_by_team: Mapping[UUID, frozenset[str]] = field(
        default_factory=lambda: MappingProxyType({})
    )                                                   # from team_members.role_id

    def in_team(self, team_id: UUID) -> bool:
        return team_id in self.allowed_team_ids

    def can(self, permission: str, team_id: UUID) -> bool:
        """Team-scoped action: org-level role OR this team's role grants it."""
        return (permission in self.org_permissions
                or permission in self.permissions_by_team.get(team_id, frozenset()))

    def can_org(self, permission: str) -> bool:
        """Org-wide action (admin console, create_role, invite into org, ...): org-level role only."""
        return permission in self.org_permissions
```

> `can_anywhere()` (earlier draft) is **removed**. Org-wide gates use `can_org()`, so a Manager's
> team-level `add_member` can't open org-wide admin features (ticket 12 D4 and D9).

**Which check applies to which permission:**

| Permission | Check | Meaning |
|---|---|---|
| `create_role`, `create_team`, `view_aggregate`, `review_strike` | `can_org` | org-wide only |
| `add_member` | `can_org` to invite someone **into the org**; `can(p, team)` to add an existing org member **to a team** | both |
| `upload_document` | `can_org` for `org`- or `role`-scoped documents; `can(p, team)` for `team`-scoped documents. **Tag target (D23, 2026-10-09):** role docs only to the caller's org role or below; team docs only to teams the caller can view | both |
| `assign_task`, `give_strike` | `can(p, team)` | team |

**No privilege escalation (ticket 12 D9):** creating, editing, assigning or removing roles and members
is allowed only for roles **strictly below the caller's highest role**, and a caller can only grant
permissions they hold themselves. The root `Admin` role (`is_system`) can't be deleted, re-parented
or have its permissions reduced, and at least one user must always hold it.

`resolve_scope()` builds `permissions_by_team` as `MappingProxyType({...})` (read-only view) so no
caller — endpoint, graph node, tool, or bug — can widen the scope after it is computed.

Every FastAPI protected endpoint receives one `AccessScope` via `Depends(get_scope)`.
Pattern for any endpoint:

```python
if not scope.in_team(team_id):
    raise HTTPException(403)
if not scope.can("give_strike", team_id):
    raise HTTPException(403)

# org-wide gate (e.g. admin console entry, ticket 12 D4)
if not (scope.can_org("create_role") or scope.can_org("add_member")):
    raise HTTPException(403)
```

**What `AccessScope` deliberately does NOT answer:** "is the caller hierarchically above the
target user?" (strikes, commendations). That depends on the *target's* role in a specific team,
so it is a DB check performed at action time, inside the write function — not precomputed here.

### 1a. Enforcement lives in the data-access layer (single choke point)

Every query function takes `scope` as a required argument and embeds it in SQL. REST endpoints
and agent tools call **the same functions** — there is no second access path.

```python
# app/services/... (data-access layer)
async def search_chunks(db, scope: AccessScope, query_vec, k: int = 5) -> list[ChunkResult]: ...
async def list_tasks(db, scope: AccessScope, filters: TaskFilters) -> list[TaskResult]: ...
async def team_summary(db, scope: AccessScope) -> TeamSummary: ...
```

- `GET /api/v1/tasks` → `list_tasks(db, scope, filters)`
- agent tool `get_tasks(filters)` → `list_tasks(db, runtime.context.scope, filters)`

A bug in agent code cannot bypass authorization because no data function is callable without a scope.

---

### 2. Clerk JWT verification — `PyJWT` + `cryptography`

Library: `pip install PyJWT cryptography`

> **Updated 2026-10-08 (ticket 12 D8):** full identity pipeline. **Clerk proves who you are and which org
> you're in; the Trellis DB decides what you can do.** Identity comes **only** from the verified token.

**Step 1: `verify_clerk_jwt` → `ClerkClaims`**

```python
from dataclasses import dataclass
from jwt import PyJWKClient
import jwt

jwks_client = PyJWKClient(settings.CLERK_JWKS_URL)   # instantiate once; caches keys by `kid`

@dataclass(frozen=True)
class ClerkClaims:
    clerk_user_id: str
    clerk_org_id: str | None
    clerk_org_role: str | None     # "org:admin" | "org:member" — used ONLY by /orgs/provision
    email: str
    name: str

def verify_clerk_jwt(token: str = Depends(bearer_scheme)) -> ClerkClaims:
    try:
        key = jwks_client.get_signing_key_from_jwt(token).key
        data = jwt.decode(
            token, key,
            algorithms=["RS256"],                         # never accept "none"/HS*
            issuer=settings.CLERK_ISSUER,
            options={"require": ["exp", "nbf", "sub", "iss"]},
            leeway=5,
        )
    except jwt.PyJWTError:
        raise HTTPException(401)
    if data.get("azp") not in settings.CLERK_AUTHORIZED_PARTIES:   # token minted for OUR frontend
        raise HTTPException(401)
    org = data.get("o") or {}                             # session token v2
    return ClerkClaims(
        clerk_user_id=data["sub"],
        clerk_org_id=org.get("id") or data.get("org_id"),        # v1 fallback
        clerk_org_role=org.get("rol") or data.get("org_role"),
        email=data["email"], name=data.get("name") or data["email"],   # custom claims (see below)
    )
```

- **Verify the claim shape** by decoding a real dev token once. The `o.id` / `o.rol` names are the v2 format and `org_id` / `org_role` the v1 format; keep whichever the dashboard issues.
- **Custom session claims** (Clerk dashboard → Sessions → Customize session token): add `email` and `name`, so creating a user just-in-time needs no Backend API call. This is in the frontend ticket 04 checklist.
- `PyJWKClient` and `jwt.decode` are synchronous. Key fetches are cached, so this is fine for the MVP.

**Step 2: `get_identity`**: upsert `users` by `clerk_user_id` (create if missing; refresh email and name if changed). Returns `Identity(user_id, email)`.

**Step 3: `get_org_context`**
1. If `claims.clerk_org_id` is missing, return **400 `no_active_org`** (the frontend sends the user to `/org-selection`).
2. Look up `organizations.id` by `clerk_org_id` (cached). If it isn't there, return **409 `org_not_provisioned`** (the frontend sends the user to `/onboarding`, ticket 12 D10).
3. Make sure an `org_members(org, user)` row exists. Inserting it just-in-time is safe because the **verified token proves Clerk membership**.
4. Apply pending invitations: every `invitations` row with `status='pending'` for (verified email, org) becomes a `team_members` row, and is then marked `accepted` (ticket 12 D10-B).
5. Return `(user_id, org_id)`.

**Step 4: `get_scope`**: `resolve_scope(user_id, org_id)`, as in §3 and §4.

**Rules**
- **Never trust request headers for identity.** FastAPI ignores `X-Org-Id`, `X-User-Id` and `X-Org-Role`, and the BFF no longer sends them (frontend ticket 03).
- Clerk org roles (`org:admin`, `org:member`) grant **nothing** in Trellis. Their only use is that `org:admin` may call `/orgs/provision`.
- **Identity-only endpoints:** `/auth/me`, `/auth/context` and `/orgs/provision` depend on `get_identity` and skip steps 3 and 4.
- **Status codes:** 401 for a bad or missing token, 403 when authenticated but not permitted, 409 when the org isn't provisioned.
- **Settings:** `CLERK_ISSUER`, `CLERK_JWKS_URL`, `CLERK_AUTHORIZED_PARTIES`, and `CLERK_SECRET_KEY` (the Backend API for provisioning, invitations and removals).

No conflicts with FastAPI, SQLAlchemy, LangGraph, or Pydantic v2.

---

### 3. `resolve_scope(user_id, org_id)` implementation

> **As built 2026-10-08 (`app/scope/resolver.py`):** the SQL below is superseded by four plain queries, run sequentially because an `AsyncSession` can't run concurrent queries:
> 1. the org's role tree (`id`, `parent_role_id`);
> 2. my team roles with their permissions;
> 3. my org role with its permissions;
> 4. the distinct `(team_id, role_id)` pairs in the org.
>
> The tree walk happens in a pure function, `build_scope()`, which also computes `governed_team_ids` (D13) and is cycle-safe. That keeps the rules in one function that is unit-tested without a database. Behavior is the same as the CTE. The cache key is a `(user_id, org_id)` tuple, and `invalidate_org(org_id)` exists.

Two DB queries (run concurrently with `asyncio.gather`):

**Query A — descendant role IDs** (corrected downward CTE — see Ticket 02 correction):
```sql
WITH RECURSIVE visible_roles AS (
    -- Seed 1: the user's TEAM roles in this org
    SELECT tm.role_id AS id
    FROM team_members tm
    WHERE tm.user_id = :user_id
      AND EXISTS (
          SELECT 1 FROM teams t WHERE t.id = tm.team_id AND t.org_id = :org_id
      )
    UNION
    -- Seed 2: the user's ORG-LEVEL role (added 2026-10-08, ticket 12 D9)
    SELECT om.role_id AS id
    FROM org_members om
    WHERE om.user_id = :user_id AND om.org_id = :org_id AND om.role_id IS NOT NULL
    UNION                                       -- UNION (not ALL) also dedupes overlapping subtrees
    -- Walk DOWN: find children of every role already in the set
    SELECT r.id FROM roles r
    INNER JOIN visible_roles vr ON r.parent_role_id = vr.id
    WHERE r.org_id = :org_id
)
SELECT id FROM visible_roles;
```

**Query B — team membership + permissions**:
```sql
SELECT tm.team_id, r.permissions
FROM team_members tm
JOIN roles r ON r.id = tm.role_id
JOIN teams t ON t.id = tm.team_id
WHERE tm.user_id = :user_id AND t.org_id = :org_id;
```

**Query C: org-level permissions** (added 2026-10-08, ticket 12 D9):
```sql
SELECT r.permissions
FROM org_members om
JOIN roles r ON r.id = om.role_id
WHERE om.user_id = :user_id AND om.org_id = :org_id;
```

Build `allowed_team_ids` and `permissions_by_team` from Query B, and `org_permissions` from Query C
(empty if there's no org role). Run A, B and C concurrently with `asyncio.gather`.

---

### 4. Caching strategy — MVP: in-process TTLCache (no Redis needed)

Use `cachetools.TTLCache` — a Python in-memory dict with automatic expiry.
Install: `pip install cachetools`. No external service, no configuration.

```python
from cachetools import TTLCache

# Module-level cache: max 1000 users cached, each entry expires after 5 minutes
_scope_cache: TTLCache = TTLCache(maxsize=1000, ttl=300)

async def resolve_scope(user_id: UUID, org_id: UUID) -> AccessScope:
    cache_key = f"{user_id}:{org_id}"
    if cache_key in _scope_cache:
        return _scope_cache[cache_key]
    scope = await _compute_scope_from_db(user_id, org_id)
    _scope_cache[cache_key] = scope
    return scope

def invalidate_scope(user_id: UUID, org_id: UUID) -> None:
    _scope_cache.pop(f"{user_id}:{org_id}", None)
```

**Explicit invalidation** — call `invalidate_scope()` from admin endpoints:

| Admin action | What to invalidate |
|---|---|
| User's role changed in a team | `invalidate_scope(affected_user_id, org_id)` |
| User added/removed from team | `invalidate_scope(affected_user_id, org_id)` |
| `roles.permissions` array changed | query all users with that role → `invalidate_scope()` for each |
| Role re-parented (`PATCH /api/v1/admin/roles/{id}` changes `parent_role_id`) | ⚠️ *Added 2026-10-08:* changes `visible_role_ids` for every user above the moved subtree → simplest safe option: clear all cache entries for that org |
| User's **org-level** role changed (`org_members.role_id`) | `invalidate_scope(affected_user_id, org_id)` *(added 2026-10-08, D9)* |
| Member removed from org (`DELETE /api/v1/admin/members/{user_id}`) | `invalidate_scope(affected_user_id, org_id)` *(added 2026-10-08, D10)* |
| Pending invitations applied on first request (`get_org_context`) | `invalidate_scope(user_id, org_id)` before computing the scope |

**Upgrade path:** When/if you deploy multiple backend servers, swap `TTLCache`
for Upstash Redis (one service, shared across all instances). The `invalidate_scope`
and `resolve_scope` function signatures stay identical — only the storage backend changes.

---

### 5. FastAPI dependency chain (complete)

```
Request
  └── verify_clerk_jwt()        → ClerkClaims (clerk_user_id, clerk_org_id, clerk_org_role, email, name)
        └── get_identity()      → Identity (user_id, email)        ← JIT upsert users
              │                    [identity-only endpoints stop here: /auth/me, /auth/context, /orgs/provision]
              └── get_org_context() → (user_id, org_id)            ← clerk_org_id → organizations.id; 409 if unknown;
                    │                                                 JIT org_members; apply pending invitations
                    └── get_scope() → AccessScope (cache hit or resolve_scope())
                          └── endpoint() → data filtering + permission checks
```

### 6. Handing the scope to the LangGraph agent — Runtime context (decided 2026-10-08, ticket 12 D1)

The scope is **not** stored in `AgentState` (that state is checkpointed to SQLite, so a stored
scope would be persisted to disk and reused stale on later turns). It is passed **per invocation**
through LangGraph's **runtime context** (`context_schema` + `Runtime`, LangGraph ≥ 0.6; installed: 1.2.11):

```python
@dataclass(frozen=True)
class AgentContext:
    scope: AccessScope        # fresh from get_scope() on every request
    audit_id: UUID            # audit_log row opened for this turn

graph = builder.compile(checkpointer=checkpointer)      # builder = StateGraph(AgentState, context_schema=AgentContext)

await graph.astream(
    {"messages": [HumanMessage(content=user_message)]},
    config={"configurable": {"thread_id": f"{org_id}:{user_id}:{session_id}"}},  # run plumbing only
    context=AgentContext(scope=scope, audit_id=audit_id),                          # who is asking
)
```

| Where | What goes there |
|---|---|
| `AgentState` (checkpointed) | conversation + loop counters + retrieved chunk ids — never auth |
| `config["configurable"]` | `thread_id` only |
| `context` (never checkpointed, never sent to the LLM) | `AccessScope`, `audit_id` |

- **Nodes** read it via a `runtime: Runtime[AgentContext]` parameter.
- **Tools** read it via LangGraph's runtime injection (`ToolRuntime` parameter or `get_runtime()` —
  confirm exact API against 1.2.11 when implementing). The LLM-visible tool schema contains only
  business args, e.g. `search_documents(query)`, never `scope`.
- **DB sessions** are opened inside each tool/data call (`async with async_session()`), not carried in context.
- **HITL strike confirmation** arrives as a new request → scope is re-resolved fresh, so a manager
  who lost `give_strike` between proposal and confirmation is correctly refused.
- **Fallback:** if runtime context is ever unavailable, `config["configurable"]["scope"]` gives the same
  isolation, minus typing (and verify the checkpointer doesn't copy configurable values into metadata).

---

## Gaps found in 2026-10-08 audit (tracked in ticket 12)

- ~~Clerk org → internal org mapping~~ → **resolved** (D8): `get_org_context` in §2.
- ~~Do not trust BFF headers~~ → **resolved** (D8): identity comes only from the verified token; the BFF no longer sends `X-*` identity headers.
- ~~Users with no team~~ → **resolved** (D9): org-level role `org_members.role_id`, used by Query A seed 2 and Query C.
- ~~**Still open, ticket 12 D13:** `allowed_team_ids` contains only teams the user is a **member** of.~~ → **resolved 2026-10-08** (D13): `allowed_team_ids` is split into:
  - `member_team_ids` (teams I'm on);
  - `governed_team_ids` (teams with ≥1 member where **every** member's team role is strictly below one of my roles).
  
  Reads use `can_view_team(team_id)` = member OR governed. Writes keep `can(p, team)`. A manager does **not** see a peer manager's team. This supersedes the `allowed_team_ids` field and the "teams does this user belong to" row in §1, which become `member_team_ids` plus `governed_team_ids`.

## Open questions for the backend dev (not blockers — decide during implementation)

- **Redis serialization**: serialize `AccessScope` as JSON (simple, portable) or
  MessagePack (faster, smaller)? JSON recommended for debuggability.
- **`permissions` column type**: currently `ARRAY(String)` in SQLAlchemy. Consider
  migrating to a `PostgreSQL ENUM` or a `JSONB` column for stricter DB-level
  enforcement. Acceptable to stay as `ARRAY(String)` for MVP.
