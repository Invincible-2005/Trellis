"""GET /api/v1/auth/me and /api/v1/auth/context (Ticket 05 §1, Ticket 13 §5)."""
import uuid
from types import SimpleNamespace

import httpx
import pytest
from sqlalchemy.dialects import postgresql

from app.api.v1 import auth as auth_routes
from app.core.database import get_db
from app.main import app
from app.models.user import User
from app.schemas.auth import OrgSummary
from app.scope.resolver import build_scope
from tests.conftest import make_token

ORG_ID = uuid.uuid4()
ADMIN_ROLE, MANAGER_ROLE = uuid.uuid4(), uuid.uuid4()
ALPHA = uuid.uuid4()

USERS = {
    "user_a": User(id=uuid.uuid4(), clerk_user_id="user_a", email="a@example.com", name="Ana"),
    "user_b": User(id=uuid.uuid4(), clerk_user_id="user_b", email="b@example.com", name="Ben"),
}


class _Result:
    def __init__(self, value=None):
        self.value = value

    def scalar_one_or_none(self):
        return self.value

    def first(self):
        return self.value


class RouteDB:
    """Fake session: finds users by the clerk_user_id in the query; answers the org-role lookup."""

    def __init__(self, orgs=None, org_role=None):
        self.orgs = orgs or {}
        self.org_role = org_role

    async def execute(self, stmt):
        params = stmt.compile(dialect=postgresql.dialect()).params
        if "clerk_user_id_1" in params:
            return _Result(USERS.get(params["clerk_user_id_1"]))
        return _Result(self.org_role)

    async def scalar(self, stmt):
        (clerk_org_id,) = stmt.compile(dialect=postgresql.dialect()).params.values()
        return self.orgs.get(clerk_org_id)


@pytest.fixture
def client_with(monkeypatch):
    """Build an HTTP client against the real app with a fake DB session."""

    def build(db):
        async def fake_get_db():
            yield db

        app.dependency_overrides[get_db] = fake_get_db
        return httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test")

    yield build
    app.dependency_overrides.clear()


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


# ── /auth/me ─────────────────────────────────────────────────────────────────

async def test_me_without_token_is_401(client_with):
    async with client_with(RouteDB()) as client:
        resp = await client.get("/api/v1/auth/me")
    assert resp.status_code == 401
    assert resp.json()["detail"]["code"] == "invalid_token"


async def test_me_ignores_spoofed_identity_headers(client_with):
    spoof = {"X-User-Id": "user_b", "X-Org-Id": "org_evil", "X-Org-Role": "org:admin"}
    async with client_with(RouteDB()) as client:
        resp = await client.get(
            "/api/v1/auth/me", headers={**_auth(make_token(sub="user_a")), **spoof}
        )
    assert resp.status_code == 200
    body = resp.json()
    assert body["clerk_user_id"] == "user_a" and body["name"] == "Ana"
    assert body["active_org_id"] is None


async def test_me_reports_active_org_once_set_up(client_with):
    db = RouteDB(orgs={"org_clerk": ORG_ID})
    async with client_with(db) as client:
        set_up = await client.get(
            "/api/v1/auth/me", headers=_auth(make_token(sub="user_a", org_id="org_clerk"))
        )
        not_set_up = await client.get(
            "/api/v1/auth/me", headers=_auth(make_token(sub="user_a", org_id="org_new"))
        )
    assert set_up.json()["active_org_id"] == str(ORG_ID)
    assert not_set_up.status_code == 200          # identity-only: never 409
    assert not_set_up.json()["active_org_id"] is None


# ── /auth/context ────────────────────────────────────────────────────────────

@pytest.fixture
def context_queries(monkeypatch):
    """Stub the list queries and the scope so the route's own logic is what's tested."""
    calls = {"ensure": 0}

    async def ensure(db, user_id, org_id):
        calls["ensure"] += 1

    async def my_orgs(db, user_id):
        return [OrgSummary(id=ORG_ID, name="Acme", clerk_org_id="org_clerk")]

    async def no_invitations(db, email):
        return []

    monkeypatch.setattr(auth_routes, "ensure_org_member", ensure)
    monkeypatch.setattr(auth_routes, "_my_orgs", my_orgs)
    monkeypatch.setattr(auth_routes, "_pending_invitations", no_invitations)
    return calls


def _use_scope(monkeypatch, **kwargs):
    async def fake_resolve(user_id, org_id, db):
        return build_scope(user_id, org_id, team_role_pairs=[], **kwargs)

    monkeypatch.setattr(auth_routes, "resolve_scope", fake_resolve)


async def test_context_without_active_org(client_with, context_queries):
    async with client_with(RouteDB()) as client:
        resp = await client.get("/api/v1/auth/context", headers=_auth(make_token(sub="user_a")))
    body = resp.json()
    assert resp.status_code == 200
    assert body["active_org"] is None
    assert body["organizations"][0]["name"] == "Acme"
    assert context_queries["ensure"] == 0


async def test_context_for_unprovisioned_org_is_not_an_error(client_with, context_queries):
    async with client_with(RouteDB()) as client:
        resp = await client.get(
            "/api/v1/auth/context", headers=_auth(make_token(sub="user_a", org_id="org_new"))
        )
    assert resp.status_code == 200
    assert resp.json()["active_org"] is None


async def test_context_for_org_admin(client_with, context_queries, monkeypatch):
    _use_scope(
        monkeypatch,
        parent_of={ADMIN_ROLE: None},
        my_team_roles=[],
        org_role=(ADMIN_ROLE, ["create_role", "add_member"]),
    )
    db = RouteDB(orgs={"org_clerk": ORG_ID}, org_role=SimpleNamespace(id=ADMIN_ROLE, name="Admin"))
    async with client_with(db) as client:
        resp = await client.get(
            "/api/v1/auth/context", headers=_auth(make_token(sub="user_a", org_id="org_clerk"))
        )
    active = resp.json()["active_org"]
    assert active["org_id"] == str(ORG_ID)
    assert active["org_role_name"] == "Admin"
    assert active["can_open_admin"] is True
    assert context_queries["ensure"] == 1


async def test_context_team_permission_does_not_open_admin(client_with, context_queries, monkeypatch):
    _use_scope(
        monkeypatch,
        parent_of={MANAGER_ROLE: None},
        my_team_roles=[(ALPHA, MANAGER_ROLE, ["add_member", "assign_task"])],
        org_role=None,
    )
    db = RouteDB(orgs={"org_clerk": ORG_ID}, org_role=None)
    async with client_with(db) as client:
        resp = await client.get(
            "/api/v1/auth/context", headers=_auth(make_token(sub="user_a", org_id="org_clerk"))
        )
    active = resp.json()["active_org"]
    assert active["can_open_admin"] is False
    assert active["org_role_name"] is None
    assert active["permissions_by_team"] == {str(ALPHA): ["add_member", "assign_task"]}
    assert active["viewable_team_ids"] == [str(ALPHA)]


# ── The list queries at least build valid Postgres SQL ───────────────────────

class _Capture:
    def __init__(self):
        self.stmt = None

    async def execute(self, stmt):
        self.stmt = stmt

        class _Empty(list):
            def scalars(self):
                return []

        return _Empty()


@pytest.mark.parametrize("query, arg", [
    (auth_routes._my_orgs, uuid.uuid4()),
    (auth_routes._pending_invitations, "A@Example.com"),
])
async def test_list_queries_compile(query, arg):
    db = _Capture()
    assert await query(db, arg) == []
    sql = str(db.stmt.compile(dialect=postgresql.dialect()))
    assert "SELECT" in sql
