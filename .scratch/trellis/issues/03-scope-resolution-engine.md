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

### 1. `AccessScope` shape — Option A (single bundled object)

```python
from dataclasses import dataclass, field
from uuid import UUID

@dataclass
class AccessScope:
    user_id: UUID
    org_id: UUID
    # RAG retrieval: user's own role(s) + all descendant role IDs (roles they govern)
    visible_role_ids: list[UUID]
    # Team data: teams the user belongs to in this org
    allowed_team_ids: list[UUID]
    # Permission check: team_id → set of permission strings
    # Values: create_role | create_team | add_member | upload_document |
    #         assign_task | give_strike | view_aggregate | review_strike
    permissions_by_team: dict[UUID, set[str]] = field(default_factory=dict)
```

Every FastAPI protected endpoint receives one `AccessScope` via `Depends(get_scope)`.
Pattern for any endpoint:

```python
if team_id not in scope.allowed_team_ids:
    raise HTTPException(403)
if "give_strike" not in scope.permissions_by_team.get(team_id, set()):
    raise HTTPException(403)
```

---

### 2. Clerk JWT verification — `PyJWT` + `cryptography`

Library: `pip install PyJWT cryptography`

Flow:
1. Next.js frontend attaches Clerk session JWT as `Authorization: Bearer <token>`
2. FastAPI dependency `verify_clerk_jwt` intercepts every request
3. Fetches Clerk JWKS from `https://<clerk-domain>/.well-known/jwks.json` — use
   `PyJWKClient` which handles JWKS caching automatically (re-fetches only when `kid`
   is unknown)
4. Verifies RS256 signature; extracts `sub` (Clerk user_id) and `org_id` from claims
5. Looks up internal `user.id` from `users` table via `clerk_user_id = sub`
6. Passes internal `user_id` + `org_id` to `resolve_scope()`

```python
from jwt import PyJWKClient
import jwt

CLERK_JWKS_URL = "https://<your-clerk-domain>/.well-known/jwks.json"
jwks_client = PyJWKClient(CLERK_JWKS_URL)  # cached — instantiate once at startup

async def verify_clerk_jwt(token: str = Depends(oauth2_scheme)) -> ClerkClaims:
    signing_key = jwks_client.get_signing_key_from_jwt(token)
    data = jwt.decode(token, signing_key.key, algorithms=["RS256"])
    return ClerkClaims(clerk_user_id=data["sub"], org_id=data.get("org_id"))
```

No conflicts with FastAPI, SQLAlchemy, LangGraph, or Pydantic v2.

---

### 3. `resolve_scope(user_id, org_id)` implementation

Two DB queries (run concurrently with `asyncio.gather`):

**Query A — descendant role IDs** (corrected downward CTE — see Ticket 02 correction):
```sql
WITH RECURSIVE visible_roles AS (
    -- Seed: the user's role(s) in this org (via team_members JOIN roles)
    SELECT DISTINCT tm.role_id AS id
    FROM team_members tm
    WHERE tm.user_id = :user_id
      AND EXISTS (
          SELECT 1 FROM teams t WHERE t.id = tm.team_id AND t.org_id = :org_id
      )
    UNION ALL
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

Build `allowed_team_ids` and `permissions_by_team` from Query B results.

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

**Upgrade path:** When/if you deploy multiple backend servers, swap `TTLCache`
for Upstash Redis (one service, shared across all instances). The `invalidate_scope`
and `resolve_scope` function signatures stay identical — only the storage backend changes.

---

### 5. FastAPI dependency chain (complete)

```
Request
  └── verify_clerk_jwt()      → ClerkClaims (clerk_user_id, org_id)
        └── get_scope()       → AccessScope (cache hit or resolve_scope())
              └── endpoint()  → uses scope for data filtering + permission checks
```

The `AgentState.scope` in LangGraph (Ticket 04) receives this `AccessScope` object
directly — it is never passed through LLM parameters.

---

## Open questions for the backend dev (not blockers — decide during implementation)

- **Redis serialization**: serialize `AccessScope` as JSON (simple, portable) or
  MessagePack (faster, smaller)? JSON recommended for debuggability.
- **`permissions` column type**: currently `ARRAY(String)` in SQLAlchemy. Consider
  migrating to a `PostgreSQL ENUM` or a `JSONB` column for stricter DB-level
  enforcement. Acceptable to stay as `ARRAY(String)` for MVP.
