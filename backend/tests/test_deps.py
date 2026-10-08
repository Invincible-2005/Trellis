"""get_current_user and first-login user creation (Ticket 13 A5, B1–B4)."""
import asyncio
import os
import uuid

import httpx
import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy import delete, func, select
from sqlalchemy.dialects import postgresql
from sqlalchemy.exc import IntegrityError

from app.core import deps
from app.models.user import User
from tests.conftest import make_token

PROFILE = {
    "first_name": "Ada",
    "last_name": "Lovelace",
    "primary_email_address_id": "idn_primary",
    "email_addresses": [
        {"id": "idn_other", "email_address": "old@example.com"},
        {"id": "idn_primary", "email_address": "ada@example.com"},
    ],
}


class _Result:
    def __init__(self, value):
        self._value = value

    def scalar_one_or_none(self):
        return self._value


class FakeSession:
    """Minimal AsyncSession stand-in: SELECTs return `existing`; INSERTs can be made to fail."""

    def __init__(self, existing=None, insert_error=None, user_after_insert=None):
        self.existing = existing
        self.insert_error = insert_error
        self.user_after_insert = user_after_insert
        self.inserted = False
        self.rolled_back = False

    async def execute(self, stmt):
        if getattr(stmt, "is_insert", False):
            if self.insert_error:
                raise self.insert_error
            self.inserted = True
            return _Result(None)
        return _Result(self.user_after_insert if self.inserted else self.existing)

    async def commit(self):
        pass

    async def rollback(self):
        self.rolled_back = True


def _bearer(token: str) -> HTTPAuthorizationCredentials:
    return HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)


@pytest.fixture
def clerk_profile(monkeypatch):
    """Serve PROFILE (or an override) instead of calling the Clerk Backend API."""
    profile = dict(PROFILE)

    async def fetch(_clerk_user_id):
        return profile

    monkeypatch.setattr(deps, "_fetch_clerk_profile", fetch)
    return profile


# ── get_current_user ─────────────────────────────────────────────────────────

async def test_missing_bearer_is_401():
    with pytest.raises(HTTPException) as info:
        await deps.get_current_user(credentials=None, db=FakeSession())
    assert info.value.status_code == 401
    assert info.value.detail["code"] == "invalid_token"


async def test_existing_user_skips_clerk(monkeypatch):
    async def fail(_):
        raise AssertionError("Clerk must not be called for a known user")

    monkeypatch.setattr(deps, "_fetch_clerk_profile", fail)
    user = User(id=uuid.uuid4(), clerk_user_id="user_known", email="k@example.com", name="K")
    got, claims = await deps.get_current_user(
        credentials=_bearer(make_token(sub="user_known")), db=FakeSession(existing=user)
    )
    assert got is user
    assert claims.clerk_user_id == "user_known"


async def test_first_login_creates_user(clerk_profile):
    created = User(id=uuid.uuid4(), clerk_user_id="user_new", email="ada@example.com", name="Ada")
    db = FakeSession(user_after_insert=created)
    got, _ = await deps.get_current_user(credentials=_bearer(make_token(sub="user_new")), db=db)
    assert db.inserted
    assert got is created


# ── B1: first-login race ─────────────────────────────────────────────────────

def test_insert_is_conflict_safe():
    sql = str(
        deps._insert_user_if_absent("user_x", "x@example.com", "X").compile(
            dialect=postgresql.dialect()
        )
    )
    assert "ON CONFLICT (clerk_user_id) DO NOTHING" in sql


async def test_lost_race_returns_winner_row(clerk_profile):
    # The insert is a no-op because a concurrent request inserted first; we re-select its row.
    winner = User(id=uuid.uuid4(), clerk_user_id="user_race", email="ada@example.com", name="Ada")
    got = await deps._create_user(FakeSession(user_after_insert=winner), "user_race")
    assert got is winner


async def test_email_owned_by_other_clerk_user_is_409(clerk_profile):
    db = FakeSession(insert_error=IntegrityError("INSERT", {}, Exception("users_email_key")))
    with pytest.raises(HTTPException) as info:
        await deps._create_user(db, "user_dup")
    assert info.value.status_code == 409
    assert info.value.detail["code"] == "email_in_use"
    assert db.rolled_back


# ── B2 / B3: email ───────────────────────────────────────────────────────────

def test_primary_email_not_first():
    assert deps._primary_email(PROFILE) == "ada@example.com"


def test_no_primary_email():
    assert deps._primary_email({"email_addresses": []}) is None
    assert deps._primary_email({"primary_email_address_id": None, "email_addresses": [
        {"id": "idn_1", "email_address": "a@example.com"}]}) is None


async def test_no_email_is_400(clerk_profile):
    clerk_profile.update(primary_email_address_id=None, email_addresses=[])
    db = FakeSession()
    with pytest.raises(HTTPException) as info:
        await deps._create_user(db, "user_noemail")
    assert info.value.status_code == 400
    assert info.value.detail["code"] == "email_required"
    assert not db.inserted


# ── B4: Clerk Backend API failures ───────────────────────────────────────────

def _mock_clerk(monkeypatch, handler):
    real_client = httpx.AsyncClient

    def client(**kwargs):
        return real_client(transport=httpx.MockTransport(handler), **kwargs)

    monkeypatch.setattr(deps.httpx, "AsyncClient", client)


async def test_clerk_network_error_is_503(monkeypatch):
    def handler(request):
        raise httpx.ConnectError("connection refused", request=request)

    _mock_clerk(monkeypatch, handler)
    with pytest.raises(HTTPException) as info:
        await deps._fetch_clerk_profile("user_x")
    assert info.value.status_code == 503
    assert info.value.detail["code"] == "auth_unavailable"


async def test_clerk_error_status_is_503(monkeypatch):
    _mock_clerk(monkeypatch, lambda request: httpx.Response(500))
    with pytest.raises(HTTPException) as info:
        await deps._fetch_clerk_profile("user_x")
    assert info.value.status_code == 503


async def test_clerk_profile_ok(monkeypatch):
    _mock_clerk(monkeypatch, lambda request: httpx.Response(200, json=PROFILE))
    assert await deps._fetch_clerk_profile("user_x") == PROFILE


# ── B1 against real Postgres (opt-in) ────────────────────────────────────────

@pytest.mark.skipif(
    not os.environ.get("TEST_DATABASE_URL"),
    reason="set TEST_DATABASE_URL to a migrated Neon *branch* to run the real race test",
)
async def test_concurrent_first_logins_create_one_row(clerk_profile):
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    from app.core.config import settings

    engine = create_async_engine(settings._to_asyncpg_url(os.environ["TEST_DATABASE_URL"]))
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    clerk_user_id = f"user_race_{uuid.uuid4().hex[:8]}"
    clerk_profile["email_addresses"] = [
        {"id": "idn_primary", "email_address": f"{clerk_user_id}@example.com"}
    ]

    async def first_login():
        async with sessions() as db:
            return await deps._create_user(db, clerk_user_id)

    try:
        a, b = await asyncio.gather(first_login(), first_login())
        assert a.id == b.id
        async with sessions() as db:
            count = await db.scalar(
                select(func.count()).select_from(User).where(User.clerk_user_id == clerk_user_id)
            )
        assert count == 1
    finally:
        async with sessions() as db:
            await db.execute(delete(User).where(User.clerk_user_id == clerk_user_id))
            await db.commit()
        await engine.dispose()
