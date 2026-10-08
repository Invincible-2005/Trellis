"""
app/core/deps.py — FastAPI Dependencies (Ticket 03)

Dependency chain injected into every protected route:

    Request
      └── get_current_user()   → (User, ClerkClaims)   [always runs]
            └── get_scope()    → AccessScope            [skipped if no org_id]
                  └── route()  → uses scope for data filtering + permission checks

Usage in any router:

    from app.core.deps import get_scope
    from app.scope.resolver import AccessScope

    @router.get("/example")
    async def example(scope: AccessScope = Depends(get_scope)):
        if not scope.can("give_strike", team_id):
            raise HTTPException(403)
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
import uuid
from typing import Optional

import httpx
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import ClerkClaims, verify_clerk_jwt
from app.core.config import settings
from app.core.database import get_db
from app.core.errors import api_error
from app.models.organization import Organization
from app.models.user import User
from app.scope.resolver import AccessScope, resolve_scope

logger = logging.getLogger(__name__)

# Bearer token extractor — a missing header is turned into a D16-shaped 401 below
_bearer = HTTPBearer(auto_error=False)


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
    # that conflict and re-select (B1). A clash on the unique email instead means
    # the address already belongs to a different Clerk user.
    try:
        await db.execute(_insert_user_if_absent(clerk_user_id, email, name))
        await db.commit()
    except IntegrityError:
        await db.rollback()
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


# ── Step 2: resolve AccessScope ───────────────────────────────────────────────

async def get_scope(
    ctx: tuple[User, ClerkClaims] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AccessScope:
    """
    Resolve and return the user's full AccessScope.

    If the JWT contains no org_id (user is not part of any org yet), returns
    an empty AccessScope. The route or frontend must handle this gracefully
    — typically by redirecting to the org creation or org selection page.

    This is the main dependency for all data routes:
        scope: AccessScope = Depends(get_scope)
    """
    user, claims = ctx

    # No org in JWT — user is authenticated but not yet provisioned in any org
    if not claims.org_id:
        return AccessScope(
            user_id=user.id,
            org_id=uuid.UUID(int=0),  # sentinel — routes must check scope.is_empty
        )

    # Look up internal org UUID from the Clerk org_id string in the JWT
    org_result = await db.execute(
        select(Organization).where(Organization.clerk_org_id == claims.org_id)
    )
    org = org_result.scalar_one_or_none()

    if org is None:
        # Org exists in Clerk but hasn't been mirrored to our DB yet.
        # This can happen for brand-new orgs before the first admin action.
        return AccessScope(
            user_id=user.id,
            org_id=uuid.UUID(int=0),  # sentinel — is_empty will be True
        )

    return await resolve_scope(user_id=user.id, org_id=org.id, db=db)


# ── Optional: convenience guard for org-required routes ──────────────────────

async def require_org_scope(
    scope: AccessScope = Depends(get_scope),
) -> AccessScope:
    """
    Stricter dependency for routes that must have an org context.
    Raises 403 if the user is not yet part of any org.

    Usage:
        @router.get("/dashboard")
        async def dashboard(scope: AccessScope = Depends(require_org_scope)):
            ...
    """
    if scope.is_empty:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not a member of any organization. "
                   "Create one or ask an admin to add you.",
        )
    return scope
