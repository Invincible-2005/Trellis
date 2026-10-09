"""Which org is the request for, and is the user in it? (Ticket 03 §2 step 3, D8/D10)."""
import uuid
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from sqlalchemy.dialects import postgresql

from app.core import deps
from app.core.auth import ClerkClaims
from app.models.user import User
from app.scope import resolver

ORG_ID = uuid.uuid4()


def _params(stmt) -> dict:
    return stmt.compile(dialect=postgresql.dialect()).params


class OrgDB:
    """Fake session: answers the org lookup and the org_members upsert."""

    def __init__(self, orgs=None, members=()):
        self.orgs = dict(orgs or {})
        self.members = set(members)
        self.org_lookups = 0
        self.inserts = 0

    async def scalar(self, stmt):
        self.org_lookups += 1
        (clerk_org_id,) = _params(stmt).values()
        return self.orgs.get(clerk_org_id)

    async def execute(self, stmt):
        params = _params(stmt)
        key = (params["user_id"], params["org_id"])
        self.inserts += 1
        is_new = key not in self.members
        self.members.add(key)
        return SimpleNamespace(rowcount=1 if is_new else 0)

    async def scalars(self, stmt):
        """Pending-invitation lookup for a new member: none in these tests."""
        return SimpleNamespace(all=lambda: [])

    async def commit(self):
        pass


def _ctx(org_id=None):
    user = User(id=uuid.uuid4(), clerk_user_id="user_a", email="a@example.com", name="A")
    return user, ClerkClaims(clerk_user_id="user_a", org_id=org_id, org_role="org:member")


async def _org_context(db, org_id="org_clerk"):
    return await deps.get_org_context(ctx=_ctx(org_id), db=db)


async def test_no_active_org_is_400():
    with pytest.raises(HTTPException) as info:
        await _org_context(OrgDB(), org_id=None)
    assert info.value.status_code == 400
    assert info.value.detail["code"] == "no_active_org"


async def test_unprovisioned_org_is_409_and_not_cached():
    db = OrgDB()
    with pytest.raises(HTTPException) as info:
        await _org_context(db)
    assert info.value.status_code == 409
    assert info.value.detail["code"] == "org_not_provisioned"

    # The org gets set up; the very next request must see it (a miss is never cached).
    db.orgs["org_clerk"] = ORG_ID
    ctx = await _org_context(db)
    assert ctx.org_id == ORG_ID


async def test_first_visit_records_membership_and_resets_cached_scope():
    db = OrgDB(orgs={"org_clerk": ORG_ID})
    user, claims = _ctx("org_clerk")
    resolver._scope_cache[(user.id, ORG_ID)] = "stale scope"

    ctx = await deps.get_org_context(ctx=(user, claims), db=db)
    assert ctx.user is user and ctx.org_id == ORG_ID
    assert (user.id, ORG_ID) in db.members
    assert (user.id, ORG_ID) not in resolver._scope_cache


async def test_known_member_skips_db_on_next_request():
    db = OrgDB(orgs={"org_clerk": ORG_ID})
    user, claims = _ctx("org_clerk")
    await deps.get_org_context(ctx=(user, claims), db=db)
    await deps.get_org_context(ctx=(user, claims), db=db)
    assert db.org_lookups == 1   # org ID cached
    assert db.inserts == 1       # membership known


async def test_existing_member_keeps_cached_scope():
    user, claims = _ctx("org_clerk")
    db = OrgDB(orgs={"org_clerk": ORG_ID}, members={(user.id, ORG_ID)})
    resolver._scope_cache[(user.id, ORG_ID)] = "fresh scope"
    await deps.get_org_context(ctx=(user, claims), db=db)
    assert resolver._scope_cache[(user.id, ORG_ID)] == "fresh scope"
