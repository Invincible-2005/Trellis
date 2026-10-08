"""
The org-context and scope SQL against real Postgres (opt-in).

Set TEST_DATABASE_URL to a migrated Neon *branch* (alembic upgrade head) to run.
Everything runs inside one transaction that is rolled back, so nothing persists.
"""
import os
import uuid

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

from app.api.v1 import auth as auth_routes
from app.core import deps
from app.core.auth import ClerkClaims
from app.core.config import settings
from app.models.invitation import Invitation
from app.models.organization import Organization, OrgMember
from app.models.role import Role
from app.models.team import Team, TeamMember
from app.models.user import User
from app.scope.resolver import resolve_scope

pytestmark = pytest.mark.skipif(
    not os.environ.get("TEST_DATABASE_URL"),
    reason="set TEST_DATABASE_URL to a migrated Neon *branch* to run the DB scope tests",
)


@pytest.fixture
async def db():
    engine = create_async_engine(settings._to_asyncpg_url(os.environ["TEST_DATABASE_URL"]))
    async with engine.connect() as conn:
        outer = await conn.begin()
        session = AsyncSession(
            bind=conn, expire_on_commit=False, join_transaction_mode="create_savepoint"
        )
        try:
            yield session
        finally:
            await session.close()
            await outer.rollback()
    await engine.dispose()


def _user(name):
    tag = uuid.uuid4().hex[:8]
    return User(id=uuid.uuid4(), clerk_user_id=f"user_{name}_{tag}",
                email=f"{name}_{tag}@example.com", name=name.title())


@pytest.fixture
async def org(db):
    """Admin ── HR ── Manager ── Employee; teams Alpha, Beta (peer managers) and Gamma."""
    u = {n: _user(n) for n in ("admin", "riya", "arjun", "bob", "esha", "eli", "gita", "newbie")}
    db.add_all(u.values())
    await db.flush()

    o = Organization(id=uuid.uuid4(), name="Acme", clerk_org_id=f"org_{uuid.uuid4().hex[:8]}",
                     created_by_user_id=u["admin"].id)
    db.add(o)
    await db.flush()

    def role(name, parent, perms=()):
        return Role(id=uuid.uuid4(), org_id=o.id, name=name, parent_role_id=parent,
                    permissions=list(perms), created_by_user_id=u["admin"].id)

    r = {}
    r["admin"] = role("Admin", None, ["create_role", "add_member", "create_team"])
    r["admin"].is_system = True
    db.add(r["admin"]); await db.flush()
    r["hr"] = role("HR", r["admin"].id, ["review_strike"]); db.add(r["hr"]); await db.flush()
    r["manager"] = role("Manager", r["hr"].id, ["assign_task", "add_member"]); db.add(r["manager"]); await db.flush()
    r["employee"] = role("Employee", r["manager"].id); db.add(r["employee"]); await db.flush()

    t = {n: Team(id=uuid.uuid4(), org_id=o.id, name=n.title(), created_by_user_id=u["admin"].id)
         for n in ("alpha", "beta", "gamma")}
    db.add_all(t.values())
    await db.flush()

    db.add_all([
        OrgMember(org_id=o.id, user_id=u["admin"].id, role_id=r["admin"].id),
        OrgMember(org_id=o.id, user_id=u["riya"].id, role_id=r["hr"].id),
        *(OrgMember(org_id=o.id, user_id=u[n].id) for n in ("arjun", "bob", "esha", "eli", "gita")),
        TeamMember(team_id=t["alpha"].id, user_id=u["arjun"].id, role_id=r["manager"].id),
        TeamMember(team_id=t["alpha"].id, user_id=u["esha"].id, role_id=r["employee"].id),
        TeamMember(team_id=t["beta"].id, user_id=u["bob"].id, role_id=r["manager"].id),
        TeamMember(team_id=t["beta"].id, user_id=u["eli"].id, role_id=r["employee"].id),
        TeamMember(team_id=t["gamma"].id, user_id=u["gita"].id, role_id=r["employee"].id),
        Invitation(email=u["newbie"].email.upper(), org_id=o.id, team_id=t["gamma"].id,
                   role_id=r["employee"].id, invited_by_user_id=u["arjun"].id),
    ])
    await db.commit()
    return o, u, r, t


async def test_scope_rules_on_real_sql(db, org):
    o, u, r, t = org
    admin = await resolve_scope(u["admin"].id, o.id, db)
    riya = await resolve_scope(u["riya"].id, o.id, db)
    arjun = await resolve_scope(u["arjun"].id, o.id, db)

    all_teams = {t["alpha"].id, t["beta"].id, t["gamma"].id}
    assert admin.viewable_team_ids == all_teams
    assert admin.can_org("create_role") and admin.can("assign_task", t["beta"].id) is False
    assert riya.viewable_team_ids == all_teams
    assert arjun.viewable_team_ids == {t["alpha"].id, t["gamma"].id}   # not Bob's team
    assert arjun.can("assign_task", t["alpha"].id) and not arjun.can_org("add_member")
    assert arjun.visible_role_ids == {r["manager"].id, r["employee"].id}


async def test_org_context_and_auth_context_queries(db, org):
    o, u, r, t = org
    newbie = u["newbie"]
    claims = ClerkClaims(clerk_user_id=newbie.clerk_user_id, org_id=o.clerk_org_id, org_role="org:member")

    ctx = await deps.get_org_context(ctx=(newbie, claims), db=db)   # first visit → member
    assert ctx.org_id == o.id
    assert [org.name for org in await auth_routes._my_orgs(db, newbie.id)] == ["Acme"]

    invites = await auth_routes._pending_invitations(db, newbie.email)   # case-insensitive
    assert [(i.team_name, i.role_name, i.invited_by_name) for i in invites] == [("Gamma", "Employee", "Arjun")]

    admin_scope = await resolve_scope(u["admin"].id, o.id, db)
    perms = await auth_routes._active_org_permissions(db, admin_scope)
    assert perms.org_role_name == "Admin" and perms.can_open_admin
