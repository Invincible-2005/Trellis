"""
app/scope/resolver.py — Scope Resolution Engine (Ticket 03)

Core invariant: resolve_scope() is the SINGLE source of truth for what
a user is allowed to see and do. It is always called server-side and its
result is injected into every protected route and every LangGraph tool.
The LLM never receives or manipulates the AccessScope object.

Two DB queries, run SEQUENTIALLY on the request's AsyncSession:
  A. Recursive CTE walking DOWN the role tree → visible_role_ids
  B. Team membership + permissions lookup   → allowed_team_ids, permissions_by_team
(An AsyncSession cannot run concurrent operations, so no asyncio.gather here.
Both queries are index lookups, so the extra round trip only happens on a cache miss.)

Result is cached in-process (TTLCache, 5-min TTL) and shared across requests,
which is why AccessScope is immutable (Ticket 12 D1).
Call invalidate_scope() from any admin route that changes roles or membership.
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from types import MappingProxyType
from typing import Mapping

from cachetools import TTLCache
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


# ── AccessScope ───────────────────────────────────────────────────────────────

@dataclass(frozen=True, slots=True)
class AccessScope:
    """
    The fully-resolved permission set for one user inside one org.
    Passed as a FastAPI dependency to every protected route and to
    LangGraph tool nodes (never through LLM parameters).

    Immutable: the same cached instance is served to every request for up to
    5 minutes, so no caller may be able to widen it. For SQL `= ANY(:ids)`
    parameters, pass `list(scope.allowed_team_ids)`.

    Fields
    ------
    user_id:
        Internal UUID from the `users` table (not the Clerk user_id string).
    org_id:
        Internal UUID from the `organizations` table.
    visible_role_ids:
        The user's own role(s) PLUS all descendant role IDs (roles below
        them in the hierarchy). Used as the scope filter in pgvector RAG search.
        A CEO gets all role IDs; an Employee gets only their own role ID.
    allowed_team_ids:
        UUIDs of every Team the user belongs to directly.
        Used to gate task, strike, and team-data endpoints.
    permissions_by_team:
        Maps team_id → set of permission strings for that team.
        Permission strings: create_role | create_team | add_member |
        upload_document | assign_task | give_strike | view_aggregate | review_strike
    """
    user_id: uuid.UUID
    org_id: uuid.UUID
    visible_role_ids: frozenset[uuid.UUID] = frozenset()
    allowed_team_ids: frozenset[uuid.UUID] = frozenset()
    permissions_by_team: Mapping[uuid.UUID, frozenset[str]] = field(
        default_factory=lambda: MappingProxyType({})
    )

    @property
    def is_empty(self) -> bool:
        """True when the user has no team memberships — authenticated but not provisioned."""
        return not self.allowed_team_ids

    def in_team(self, team_id: uuid.UUID) -> bool:
        """Check whether this user is a member of a specific team."""
        return team_id in self.allowed_team_ids

    def can(self, permission: str, team_id: uuid.UUID) -> bool:
        """Check whether this user has a specific permission in a specific team."""
        return permission in self.permissions_by_team.get(team_id, frozenset())


# ── In-process TTL cache ──────────────────────────────────────────────────────
# Key: "{user_id}:{org_id}" string. TTL: 300 seconds (5 minutes).
# Upgrade path: swap TTLCache for Upstash Redis when running multi-worker.
# The resolve_scope / invalidate_scope signatures stay identical.

_scope_cache: TTLCache = TTLCache(maxsize=1000, ttl=300)


def invalidate_scope(user_id: uuid.UUID, org_id: uuid.UUID) -> None:
    """
    Immediately evict the cached scope for a user+org pair.

    Call this from every admin route that mutates roles or team memberships:
      - User's role changed in a team
      - User added to or removed from a team
      - A role's permissions array changed (call for every affected user)
    """
    _scope_cache.pop(f"{user_id}:{org_id}", None)


# ── Core resolver ─────────────────────────────────────────────────────────────

async def resolve_scope(
    user_id: uuid.UUID,
    org_id: uuid.UUID,
    db: AsyncSession,
) -> AccessScope:
    """
    Compute (or return cached) AccessScope for a user inside an org.

    Cache hit  → returns instantly with no DB queries.
    Cache miss → runs two SQL queries (sequentially), caches result, returns scope.
    """
    cache_key = f"{user_id}:{org_id}"

    # ── Cache hit ─────────────────────────────────────────────────────────
    if cache_key in _scope_cache:
        return _scope_cache[cache_key]

    # ── Cache miss: one session → one query at a time ─────────────────────
    visible_role_ids = await _query_visible_role_ids(user_id, org_id, db)
    allowed_team_ids, permissions_by_team = await _query_team_permissions(user_id, org_id, db)

    scope = AccessScope(
        user_id=user_id,
        org_id=org_id,
        visible_role_ids=visible_role_ids,
        allowed_team_ids=allowed_team_ids,
        permissions_by_team=permissions_by_team,
    )

    _scope_cache[cache_key] = scope
    return scope


# ── Private query helpers ─────────────────────────────────────────────────────

async def _query_visible_role_ids(
    user_id: uuid.UUID,
    org_id: uuid.UUID,
    db: AsyncSession,
) -> frozenset[uuid.UUID]:
    """
    Query A — Recursive CTE walking DOWN the role tree.

    UNION (not UNION ALL) deduplicates overlapping subtrees and guarantees
    termination even if a bad re-parent ever creates a cycle in roles.

    Starts from the user's own role(s) in this org, then walks to children,
    grandchildren, etc. The result is every role ID at or below the user's
    level — these map to the documents the user is allowed to see.

    Access rule: doc tagged to Role R → visible to R and all ANCESTOR roles
    (senior roles above R). So a senior user must have all junior role IDs
    in visible_role_ids to match those document tags in vector search.
    """
    result = await db.execute(
        text("""
            WITH RECURSIVE visible_roles AS (
                -- Seed: the user's actual role(s) in this org
                SELECT DISTINCT tm.role_id AS id
                FROM team_members tm
                WHERE tm.user_id = :user_id
                  AND EXISTS (
                      SELECT 1 FROM teams t
                      WHERE t.id = tm.team_id AND t.org_id = :org_id
                  )

                UNION

                -- Walk DOWN: children of every role already in the set
                SELECT r.id
                FROM roles r
                INNER JOIN visible_roles vr ON r.parent_role_id = vr.id
                WHERE r.org_id = :org_id
            )
            SELECT id FROM visible_roles
        """),
        {"user_id": str(user_id), "org_id": str(org_id)},
    )
    return frozenset(uuid.UUID(str(row.id)) for row in result)


async def _query_team_permissions(
    user_id: uuid.UUID,
    org_id: uuid.UUID,
    db: AsyncSession,
) -> tuple[frozenset[uuid.UUID], Mapping[uuid.UUID, frozenset[str]]]:
    """
    Query B — Team membership + permissions per team.

    Returns:
        allowed_team_ids    : team UUIDs the user belongs to
        permissions_by_team : read-only team_id → permission strings
    """
    result = await db.execute(
        text("""
            SELECT tm.team_id, r.permissions
            FROM team_members tm
            JOIN roles r ON r.id = tm.role_id
            JOIN teams t ON t.id = tm.team_id
            WHERE tm.user_id = :user_id AND t.org_id = :org_id
        """),
        {"user_id": str(user_id), "org_id": str(org_id)},
    )

    permissions_by_team: dict[uuid.UUID, frozenset[str]] = {}

    for row in result:
        team_id = uuid.UUID(str(row.team_id))
        # row.permissions is a Postgres ARRAY(String) — already a Python list
        permissions_by_team[team_id] = frozenset(row.permissions or [])

    return frozenset(permissions_by_team), MappingProxyType(permissions_by_team)
