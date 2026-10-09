"""
app/scope/resolver.py — Scope Resolution Engine (Ticket 03)

Core invariant: resolve_scope() is the SINGLE source of truth for what
a user is allowed to see and do. It is always called server-side and its
result is injected into every protected route and every LangGraph tool.
The LLM never receives or manipulates the AccessScope object.

On a cache miss, four small queries run SEQUENTIALLY on the request's
AsyncSession (it cannot run concurrent operations):
  1. the org's role tree (id → parent)
  2. the user's team memberships with each team role's permissions
  3. the user's org-level role and its permissions (D9)
  4. which roles sit in which team (for governed teams, D13)
The tree walk itself happens in Python (build_scope), which keeps the rules in
one testable function. An org has tens of roles, so fetching the tree is cheap.

Result is cached in-process (TTLCache, 5-min TTL) and shared across requests,
which is why AccessScope is immutable (Ticket 12 D1).
Call invalidate_scope() / invalidate_org() from any route that changes roles or membership.
"""
from __future__ import annotations

import uuid
from collections import defaultdict
from dataclasses import dataclass, field
from types import MappingProxyType
from typing import Iterable, Mapping, Optional

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
    parameters, pass `list(scope.viewable_team_ids)` (or another field).

    Fields
    ------
    user_id:
        Internal UUID from the `users` table (not the Clerk user_id string).
    org_id:
        Internal UUID from the `organizations` table.
    visible_role_ids:
        The user's own roles (team roles + org-level role) PLUS every role
        below them. Filter for role-scoped documents.
    member_team_ids:
        Teams the user is a member of.
    governed_team_ids:
        Teams with at least one member where EVERY member's team role is
        strictly below one of the user's roles (D13). An org Admin governs every
        staffed team; a manager does not govern a peer manager's team.
    org_permissions:
        Permissions of the org-level role (D9). Apply in every team.
    org_role_id:
        The org-level role (D9), or None if the user has none.
    manageable_role_ids:
        Every role strictly below the org-level role (D17). Team roles never
        count here. The caller may edit, delete or assign only these roles.
    permissions_by_team:
        team_id → permissions of the user's role in that team.
        Permission strings: create_role | create_team | add_member |
        upload_document | assign_task | give_strike | view_aggregate | review_strike
    """
    user_id: uuid.UUID
    org_id: uuid.UUID
    visible_role_ids: frozenset[uuid.UUID] = frozenset()
    member_team_ids: frozenset[uuid.UUID] = frozenset()
    governed_team_ids: frozenset[uuid.UUID] = frozenset()
    org_permissions: frozenset[str] = frozenset()
    org_role_id: Optional[uuid.UUID] = None
    manageable_role_ids: frozenset[uuid.UUID] = frozenset()
    permissions_by_team: Mapping[uuid.UUID, frozenset[str]] = field(
        default_factory=lambda: MappingProxyType({})
    )

    @property
    def viewable_team_ids(self) -> frozenset[uuid.UUID]:
        """Teams whose tasks, team docs and dashboards the user may read."""
        return self.member_team_ids | self.governed_team_ids

    def in_team(self, team_id: uuid.UUID) -> bool:
        """Membership check: is the user on this team?"""
        return team_id in self.member_team_ids

    def can_view_team(self, team_id: uuid.UUID) -> bool:
        """Read access to a team: member, or every member ranks below the user (D13)."""
        return team_id in self.member_team_ids or team_id in self.governed_team_ids

    def can(self, permission: str, team_id: uuid.UUID) -> bool:
        """Team-scoped action: the org-level role OR the user's role in this team grants it."""
        return (permission in self.org_permissions
                or permission in self.permissions_by_team.get(team_id, frozenset()))

    def can_org(self, permission: str) -> bool:
        """Org-wide action (admin console, create_role, invite into org): org-level role only."""
        return permission in self.org_permissions

    def can_manage_role(self, role_id: uuid.UUID) -> bool:
        """Is this role strictly below the user's org-level role (D17)?"""
        return role_id in self.manageable_role_ids


# ── Pure scope computation ────────────────────────────────────────────────────

def _strictly_below(
    seeds: Iterable[uuid.UUID],
    parent_of: Mapping[uuid.UUID, Optional[uuid.UUID]],
) -> frozenset[uuid.UUID]:
    """Every role strictly below at least one seed. Cycle-safe (visited set)."""
    children: dict[uuid.UUID, list[uuid.UUID]] = defaultdict(list)
    for role_id, parent_id in parent_of.items():
        if parent_id is not None:
            children[parent_id].append(role_id)

    below: set[uuid.UUID] = set()
    stack = [child for seed in seeds for child in children.get(seed, ())]
    while stack:
        role_id = stack.pop()
        if role_id in below:
            continue
        below.add(role_id)
        stack.extend(children.get(role_id, ()))
    return frozenset(below)


def build_scope(
    user_id: uuid.UUID,
    org_id: uuid.UUID,
    *,
    parent_of: Mapping[uuid.UUID, Optional[uuid.UUID]],
    my_team_roles: Iterable[tuple[uuid.UUID, uuid.UUID, Iterable[str]]],
    org_role: Optional[tuple[uuid.UUID, Iterable[str]]],
    team_role_pairs: Iterable[tuple[uuid.UUID, uuid.UUID]],
) -> AccessScope:
    """
    Compute an AccessScope from plain rows (no DB access).

    parent_of       : every role in the org → its parent role (None for a root)
    my_team_roles   : (team_id, role_id, permissions) for each team the user is on
    org_role        : (role_id, permissions) of the user's org-level role, or None
    team_role_pairs : (team_id, role_id) for every member of every team in the org
    """
    my_team_roles = list(my_team_roles)
    seeds = {role_id for _, role_id, _ in my_team_roles}
    org_permissions: frozenset[str] = frozenset()
    org_role_id: Optional[uuid.UUID] = None
    manageable: frozenset[uuid.UUID] = frozenset()
    if org_role is not None:
        org_role_id = org_role[0]
        seeds.add(org_role_id)
        org_permissions = frozenset(org_role[1] or ())
        # D17: only the org-level role is the yardstick for managing roles.
        manageable = _strictly_below([org_role_id], parent_of)

    below = _strictly_below(seeds, parent_of)

    roles_in_team: dict[uuid.UUID, set[uuid.UUID]] = defaultdict(set)
    for team_id, role_id in team_role_pairs:
        roles_in_team[team_id].add(role_id)
    # Non-empty by construction: a team appears only if it has a member.
    governed = frozenset(team_id for team_id, roles in roles_in_team.items() if roles <= below)

    permissions_by_team = {
        team_id: frozenset(perms or ()) for team_id, _, perms in my_team_roles
    }
    return AccessScope(
        user_id=user_id,
        org_id=org_id,
        visible_role_ids=frozenset(seeds) | below,
        member_team_ids=frozenset(permissions_by_team),
        governed_team_ids=governed,
        org_permissions=org_permissions,
        org_role_id=org_role_id,
        manageable_role_ids=manageable,
        permissions_by_team=MappingProxyType(permissions_by_team),
    )


# ── In-process TTL cache ──────────────────────────────────────────────────────
# Key: (user_id, org_id). TTL: 300 seconds (5 minutes).
# Upgrade path: swap TTLCache for Upstash Redis when running multi-worker.
# The resolve_scope / invalidate_* signatures stay identical.

_scope_cache: TTLCache = TTLCache(maxsize=1000, ttl=300)


def invalidate_scope(user_id: uuid.UUID, org_id: uuid.UUID) -> None:
    """
    Immediately evict the cached scope for a user+org pair.

    Call this from every route that changes one user's access:
      - role changed in a team, or org-level role changed
      - added to or removed from a team, or removed from the org
      - joined the org (just-in-time membership)
    """
    _scope_cache.pop((user_id, org_id), None)


def invalidate_org(org_id: uuid.UUID) -> None:
    """
    Evict every cached scope in an org. Use when a change affects many users:
    a role re-parented, a role's permissions edited, or team membership changes
    that alter which teams other people govern (D13).
    """
    for key in [k for k in list(_scope_cache.keys()) if k[1] == org_id]:
        _scope_cache.pop(key, None)


# ── Core resolver ─────────────────────────────────────────────────────────────

async def resolve_scope(
    user_id: uuid.UUID,
    org_id: uuid.UUID,
    db: AsyncSession,
) -> AccessScope:
    """
    Compute (or return cached) AccessScope for a user inside an org.

    Cache hit  → returns instantly with no DB queries.
    Cache miss → runs four small queries (sequentially), caches result, returns scope.
    """
    cache_key = (user_id, org_id)
    cached = _scope_cache.get(cache_key)
    if cached is not None:
        return cached

    params = {"user_id": user_id, "org_id": org_id}

    roles = await db.execute(
        text("SELECT id, parent_role_id FROM roles WHERE org_id = :org_id"), params
    )
    parent_of = {row.id: row.parent_role_id for row in roles}

    my_teams = await db.execute(
        text("""
            SELECT tm.team_id, tm.role_id, r.permissions
            FROM team_members tm
            JOIN teams t ON t.id = tm.team_id
            JOIN roles r ON r.id = tm.role_id
            WHERE tm.user_id = :user_id AND t.org_id = :org_id
        """),
        params,
    )
    my_team_roles = [(row.team_id, row.role_id, row.permissions) for row in my_teams]

    org_member = await db.execute(
        text("""
            SELECT om.role_id, r.permissions
            FROM org_members om
            JOIN roles r ON r.id = om.role_id
            WHERE om.user_id = :user_id AND om.org_id = :org_id
        """),
        params,
    )
    org_row = org_member.first()
    org_role = (org_row.role_id, org_row.permissions) if org_row else None

    pairs = await db.execute(
        text("""
            SELECT DISTINCT tm.team_id, tm.role_id
            FROM team_members tm
            JOIN teams t ON t.id = tm.team_id
            WHERE t.org_id = :org_id
        """),
        params,
    )
    team_role_pairs = [(row.team_id, row.role_id) for row in pairs]

    scope = build_scope(
        user_id,
        org_id,
        parent_of=parent_of,
        my_team_roles=my_team_roles,
        org_role=org_role,
        team_role_pairs=team_role_pairs,
    )
    _scope_cache[cache_key] = scope
    return scope
