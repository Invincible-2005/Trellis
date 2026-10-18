"""
app/core/deps.py — FastAPI Dependencies (Ticket 03)

Dependency chain injected into every protected route:

    Request
      └── get_current_user()        → (User, ClerkClaims)   verify JWT, JIT user row
            └── get_org_context()   → OrgContext            400 no org / 409 not provisioned,
                  │                                          JIT org membership
                  └── get_scope()   → AccessScope           cached resolve_scope()
                        └── route() → data filtering + permission checks

Identity-only routes (/auth/me, /auth/context, /orgs/provision) stop at
get_current_user so they work before an org is selected or set up.

Usage in any router:

    from app.core.deps import get_scope
    from app.scope.resolver import AccessScope

    @router.get("/example")
    async def example(scope: AccessScope = Depends(get_scope)):
        if not scope.can("give_strike", team_id):
            raise api_error(403, "forbidden", "You can't give strikes in this team.")
        ...

    # For routes that only need the user row (e.g. /auth/me):
    from app.core.deps import get_current_user

    @router.get("/auth/me")
    async def me(ctx: tuple = Depends(get_current_user)):
        user, claims = ctx
        ...
"""
import asyncio
import logging
import secrets
import uuid
from dataclasses import dataclass
from typing import Optional

import httpx
from cachetools import TTLCache
from fastapi import Depends, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import ClerkClaims, verify_clerk_jwt
from app.core.config import settings
from app.core.database import get_db
from app.core.errors import api_error
from app.models.organization import Organization, OrgMember
from app.models.user import User
from app.scope.resolver import AccessScope, invalidate_scope, resolve_scope
from app.services.members import apply_pending_invitations, was_removed

logger = logging.getLogger(__name__)

# Bearer token extractor — a missing header is turned into a D16-shaped 401 below
_bearer = HTTPBearer(auto_error=False)


# ── Step 0: only the Trellis web app may call the API (ticket 12 D62) ─────────

async def require_internal_key(request: Request) -> None:
    """
    Refuse the call unless it carries the shared secret the Next.js server sends.
    This is a deployment gate, not identity: who the user is still comes only from the
    Clerk token. Off when INTERNAL_API_KEY is empty (local development, tests).
    Reads the raw header, so it adds nothing to openapi.json.
    """
    expected = settings.INTERNAL_API_KEY
    if not expected:
        return
    sent = request.headers.get("x-internal-key", "")
    # compare_digest takes the same time however many characters match (no timing leaks)
    if not secrets.compare_digest(sent.encode(), expected.encode()):
        raise api_error(
            status.HTTP_403_FORBIDDEN,
            "forbidden",
            "This API only accepts requests from the Trellis web app.",
        )


# ── Step 1: verify JWT + upsert User row ──────────────────────────────────────

async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
    db: AsyncSession = Depends(get_db),
) -> tuple[User, ClerkClaims]:
    """
    Verify the Clerk JWT and return the corresponding User row.

    On first login:
      - Calls the Clerk Backend API to fetch the user's primary email and name.
      - Creates a User row in our database (race-safe: concurrent first
        requests insert one row, B1).
      - All subsequent requests skip the Clerk API call (just a DB lookup).

    Returns (User, ClerkClaims) so routes can access both the internal
    user object and the raw Clerk claims (e.g. org_id, org_role).
    """
    if credentials is None:
        raise api_error(
            status.HTTP_401_UNAUTHORIZED,
            "invalid_token",
            "You are not signed in.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # JWKS fetching is blocking I/O — keep it off the event loop (A5).
    claims = await asyncio.to_thread(verify_clerk_jwt, credentials.credentials)

    user = await _get_user(db, claims.clerk_user_id)
    if user is None:
        user = await _create_user(db, claims.clerk_user_id)

    return user, claims


async def _get_user(db: AsyncSession, clerk_user_id: str) -> Optional[User]:
    result = await db.execute(select(User).where(User.clerk_user_id == clerk_user_id))
    return result.scalar_one_or_none()


async def _create_user(db: AsyncSession, clerk_user_id: str) -> User:
    """First login: create the User row from the Clerk profile."""
    profile = await _fetch_clerk_profile(clerk_user_id)
    email = _primary_email(profile)
    if not email:
        # Invitations are matched by email (D10), so a user without one can't be placed.
        raise api_error(
            status.HTTP_400_BAD_REQUEST,
            "email_required",
            "Your account needs an email address. Add one in your profile and try again.",
        )
    first = profile.get("first_name") or ""
    last = profile.get("last_name") or ""
    name = f"{first} {last}".strip() or email  # fallback to email if no name

    # A concurrent first request may insert the same user first: do nothing on
    # that conflict and re-select (B1). A clash on the unique email can mean two things:
    # the same person's other request won the race (their row has our Clerk id), or the
    # address really belongs to a different Clerk user.
    try:
        await db.execute(_insert_user_if_absent(clerk_user_id, email, name))
        await db.commit()
    except IntegrityError:
        await db.rollback()
        existing = await _get_user(db, clerk_user_id)
        if existing is not None:
            return existing
        logger.warning("Email %s already linked to another Clerk user", email)
        raise api_error(
            status.HTTP_409_CONFLICT,
            "email_in_use",
            "This email is already linked to another account. Contact your admin.",
        )

    user = await _get_user(db, clerk_user_id)
    if user is None:  # pragma: no cover — the insert or the conflicting row guarantees one
        raise RuntimeError(f"User {clerk_user_id} missing after upsert")
    return user


def _insert_user_if_absent(clerk_user_id: str, email: str, name: str):
    """INSERT … ON CONFLICT (clerk_user_id) DO NOTHING."""
    return (
        pg_insert(User)
        .values(id=uuid.uuid4(), clerk_user_id=clerk_user_id, email=email, name=name)
        .on_conflict_do_nothing(index_elements=[User.clerk_user_id])
    )


def _primary_email(profile: dict) -> Optional[str]:
    """Clerk's primary email (B2); `email_addresses[0]` is not necessarily the primary."""
    primary_id = profile.get("primary_email_address_id")
    for address in profile.get("email_addresses") or []:
        if address.get("id") == primary_id:
            return address.get("email_address") or None
    return None


async def _fetch_clerk_profile(clerk_user_id: str) -> dict:
    """
    Fetch a user profile from Clerk's Backend API.
    Only called once per user — on their very first request to this backend.
    """
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                f"https://api.clerk.com/v1/users/{clerk_user_id}",
                headers={"Authorization": f"Bearer {settings.CLERK_SECRET_KEY}"},
            )
    except httpx.HTTPError:
        logger.exception("Clerk Backend API unreachable")
        resp = None  # handled below (B4)

    if resp is None or resp.status_code != 200:
        if resp is not None:
            logger.error("Clerk Backend API returned %s for user lookup", resp.status_code)
        raise api_error(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "auth_unavailable",
            "Could not verify your profile with Clerk. Please try again.",
        )
    return resp.json()


# ── Step 2: org context (which org, and are you in it?) ──────────────────────

@dataclass(frozen=True)
class OrgContext:
    """The verified user plus the Trellis org their token's active org maps to."""
    user: User
    claims: ClerkClaims
    org_id: uuid.UUID


# clerk_org_id → organizations.id. Only found orgs are cached: provisioning can
# make an unknown org appear at any moment, and orgs are never deleted in the MVP.
_org_id_cache: TTLCache = TTLCache(maxsize=1000, ttl=300)

# (user_id, org_id) pairs whose org_members row is known to exist, so the
# just-in-time insert runs once per user per org per 5 minutes, not every request.
_known_members: TTLCache = TTLCache(maxsize=10_000, ttl=300)


async def lookup_org_id(db: AsyncSession, clerk_org_id: str) -> Optional[uuid.UUID]:
    """Map a Clerk org ID to the Trellis org ID, or None if it isn't provisioned yet."""
    org_id = _org_id_cache.get(clerk_org_id)
    if org_id is None:
        org_id = await db.scalar(
            select(Organization.id).where(Organization.clerk_org_id == clerk_org_id)
        )
        if org_id is not None:
            _org_id_cache[clerk_org_id] = org_id
    return org_id


async def ensure_org_member(db: AsyncSession, user: User, org_id: uuid.UUID) -> None:
    """
    Just-in-time org membership (D8/D10). Safe because the verified token proves
    the user is a member of this org in Clerk, and Trellis only adds people to
    Clerk orgs itself (or they created the org). A newly created membership picks
    up the user's pending invitations (org role / teams) in the same commit.

    Raises:
        403 not_a_member — removed from the org minutes ago; their old token still
                           names it, but they must not be re-added (D38)
    """
    if was_removed(user.id, org_id):
        raise api_error(
            status.HTTP_403_FORBIDDEN,
            "not_a_member",
            "You're no longer a member of this organization.",
        )

    key = (user.id, org_id)
    if key in _known_members:
        return

    result = await db.execute(
        pg_insert(OrgMember)
        .values(id=uuid.uuid4(), org_id=org_id, user_id=user.id)
        .on_conflict_do_nothing(index_elements=[OrgMember.org_id, OrgMember.user_id])
    )
    joined = bool(result.rowcount)
    if joined:
        await apply_pending_invitations(db, user, org_id)
    await db.commit()
    if joined:
        logger.info("User %s joined org %s (just-in-time membership)", user.id, org_id)
        invalidate_scope(user.id, org_id)
    _known_members[key] = True


async def get_org_context(
    ctx: tuple[User, ClerkClaims] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> OrgContext:
    """
    Resolve the token's active org to a Trellis org the user belongs to.

    Raises:
        400 no_active_org        — no org selected in Clerk (frontend → /org-selection)
        409 org_not_provisioned  — org exists in Clerk, not set up in Trellis yet
                                   (frontend → /onboarding)
    """
    user, claims = ctx
    if not claims.org_id:
        raise api_error(
            status.HTTP_400_BAD_REQUEST,
            "no_active_org",
            "Select or create an organization first.",
        )

    org_id = await lookup_org_id(db, claims.org_id)
    if org_id is None:
        raise api_error(
            status.HTTP_409_CONFLICT,
            "org_not_provisioned",
            "This workspace hasn't been set up yet.",
        )

    await ensure_org_member(db, user, org_id)
    return OrgContext(user=user, claims=claims, org_id=org_id)


# ── Step 3: resolve AccessScope ───────────────────────────────────────────────

async def get_scope(
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
) -> AccessScope:
    """
    The user's AccessScope in their active org. Main dependency for all data routes:
        scope: AccessScope = Depends(get_scope)
    """
    return await resolve_scope(user_id=ctx.user.id, org_id=ctx.org_id, db=db)
