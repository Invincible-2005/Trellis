"""
Who can see and do what (Ticket 03, decisions D9 and D13).

The org used throughout:

    Admin ── HR ── Manager ── Employee        (role tree)

    Team Alpha : Arjun (Manager), Esha (Employee)
    Team Beta  : Bob (Manager),   Eli (Employee)
    Team Gamma : Gita (Employee)                 — staffed only by employees
    Team HR    : Riya (HR)
    Team Empty : nobody
"""
import uuid
from types import SimpleNamespace

import pytest

from app.scope import resolver
from app.scope.resolver import build_scope, invalidate_org, invalidate_scope, resolve_scope

ORG = uuid.uuid4()
OTHER_ORG = uuid.uuid4()
ADMIN, HR, MANAGER, EMPLOYEE = (uuid.uuid4() for _ in range(4))
PARENT_OF = {ADMIN: None, HR: ADMIN, MANAGER: HR, EMPLOYEE: MANAGER}

ALPHA, BETA, GAMMA, HR_TEAM, EMPTY = (uuid.uuid4() for _ in range(5))
TEAM_ROLE_PAIRS = [
    (ALPHA, MANAGER), (ALPHA, EMPLOYEE),
    (BETA, MANAGER), (BETA, EMPLOYEE),
    (GAMMA, EMPLOYEE),
    (HR_TEAM, HR),
]  # EMPTY has no members, so it never appears here

ALL_PERMS = {"create_role", "create_team", "add_member", "upload_document",
             "assign_task", "give_strike", "view_aggregate", "review_strike"}
MANAGER_PERMS = {"assign_task", "give_strike", "add_member"}


def scope_for(my_team_roles=(), org_role=None):
    return build_scope(
        uuid.uuid4(), ORG,
        parent_of=PARENT_OF,
        my_team_roles=my_team_roles,
        org_role=org_role,
        team_role_pairs=TEAM_ROLE_PAIRS,
    )


# ── Team visibility: "every member ranks below you" ──────────────────────────

def test_org_admin_on_no_team_sees_every_staffed_team():
    admin = scope_for(org_role=(ADMIN, ALL_PERMS))
    assert admin.member_team_ids == frozenset()
    assert admin.viewable_team_ids == {ALPHA, BETA, GAMMA, HR_TEAM}
    assert not admin.can_view_team(EMPTY)  # empty teams: admin console only


def test_hr_sees_teams_led_by_managers_but_not_own_level():
    riya = scope_for(my_team_roles=[(HR_TEAM, HR, {"review_strike"})])
    assert riya.governed_team_ids == {ALPHA, BETA, GAMMA}
    assert riya.can_view_team(HR_TEAM)        # as a member
    assert HR_TEAM not in riya.governed_team_ids  # HR isn't strictly below HR


def test_manager_sees_own_team_not_peer_managers_team():
    arjun = scope_for(my_team_roles=[(ALPHA, MANAGER, MANAGER_PERMS)])
    assert arjun.can_view_team(ALPHA)
    assert not arjun.can_view_team(BETA)       # Bob is at Arjun's level
    assert arjun.can_view_team(GAMMA)          # everyone there is an Employee
    assert not arjun.can_view_team(HR_TEAM)


def test_employee_sees_only_own_team():
    esha = scope_for(my_team_roles=[(ALPHA, EMPLOYEE, set())])
    assert esha.viewable_team_ids == {ALPHA}


# ── Document visibility (role-scoped) ────────────────────────────────────────

def test_visible_roles_are_own_roles_and_everything_below():
    assert scope_for(org_role=(ADMIN, ALL_PERMS)).visible_role_ids == {ADMIN, HR, MANAGER, EMPLOYEE}
    assert scope_for(my_team_roles=[(ALPHA, MANAGER, ())]).visible_role_ids == {MANAGER, EMPLOYEE}
    assert scope_for(my_team_roles=[(ALPHA, EMPLOYEE, ())]).visible_role_ids == {EMPLOYEE}


def test_team_role_and_org_role_both_count():
    # An Employee in Alpha who also holds the org-level HR role
    both = scope_for(my_team_roles=[(ALPHA, EMPLOYEE, ())], org_role=(HR, {"review_strike"}))
    assert both.visible_role_ids == {HR, MANAGER, EMPLOYEE}
    assert both.governed_team_ids == {ALPHA, BETA, GAMMA}


def test_role_tree_cycle_does_not_hang():
    a, b = uuid.uuid4(), uuid.uuid4()
    scope = build_scope(
        uuid.uuid4(), ORG,
        parent_of={a: b, b: a},  # corrupt data: a cycle
        my_team_roles=[], org_role=(a, ()), team_role_pairs=[],
    )
    assert scope.visible_role_ids == {a, b}


# ── Permissions: can vs can_org ──────────────────────────────────────────────

def test_team_permission_does_not_open_admin_console():
    arjun = scope_for(my_team_roles=[(ALPHA, MANAGER, MANAGER_PERMS)])
    assert arjun.can("add_member", ALPHA)
    assert not arjun.can("add_member", BETA)
    assert not arjun.can_org("add_member")      # team-level grant stays in the team


def test_org_role_permissions_apply_in_every_team():
    admin = scope_for(org_role=(ADMIN, ALL_PERMS))
    assert admin.can("give_strike", BETA)
    assert admin.can_org("create_role")


def test_scope_cannot_be_widened():
    scope = scope_for(my_team_roles=[(ALPHA, MANAGER, MANAGER_PERMS)])
    with pytest.raises(TypeError):
        scope.permissions_by_team[BETA] = frozenset({"give_strike"})
    with pytest.raises(AttributeError):
        scope.org_permissions = frozenset(ALL_PERMS)


# ── resolve_scope: queries + cache ───────────────────────────────────────────

class _Rows(list):
    def first(self):
        return self[0] if self else None


class QueryLog:
    """Answers resolve_scope's four queries in order and counts calls."""

    def __init__(self):
        self.calls = 0

    async def execute(self, stmt, params=None):
        self.calls += 1
        sql = str(stmt)
        if "parent_role_id FROM roles" in sql:
            return _Rows(SimpleNamespace(id=r, parent_role_id=p) for r, p in PARENT_OF.items())
        if "WHERE tm.user_id" in sql:
            return _Rows([SimpleNamespace(team_id=ALPHA, role_id=MANAGER, permissions=list(MANAGER_PERMS))])
        if "FROM org_members" in sql:
            return _Rows()
        return _Rows(SimpleNamespace(team_id=t, role_id=r) for t, r in TEAM_ROLE_PAIRS)


async def test_resolve_scope_builds_and_caches():
    db, user = QueryLog(), uuid.uuid4()
    scope = await resolve_scope(user, ORG, db)
    assert scope.viewable_team_ids == {ALPHA, GAMMA}
    assert db.calls == 4

    assert await resolve_scope(user, ORG, db) is scope
    assert db.calls == 4  # cache hit: no queries


async def test_invalidate_scope_and_org():
    db, user = QueryLog(), uuid.uuid4()
    other = uuid.uuid4()
    await resolve_scope(user, ORG, db)
    await resolve_scope(other, OTHER_ORG, db)

    invalidate_scope(user, ORG)
    assert (user, ORG) not in resolver._scope_cache

    await resolve_scope(user, ORG, db)
    invalidate_org(ORG)
    assert (user, ORG) not in resolver._scope_cache
    assert (other, OTHER_ORG) in resolver._scope_cache  # other orgs untouched
