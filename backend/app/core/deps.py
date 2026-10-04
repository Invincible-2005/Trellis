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
import uuid
from typing import Optional

import httpx
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import ClerkClaims, verify_clerk_jwt
from app.core.config import settings
from app.core.database import get_db
from app.models.organization import Organization
from app.models.user import User
from app.scope.resolver import AccessScope, resolve_scope

# Bearer token extractor — raises 401 automatically if header is missing
_bearer = HTTPBearer(auto_error=True)


# ── Step 1: verify JWT + upsert User row ──────────────────────────────────────

async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
    db: AsyncSession = Depends(get_db),
) -> tuple[User, ClerkClaims]:
    """
    Verify the Clerk JWT and return the corresponding User row.

    On first login:
      - Calls the Clerk Backend API to fetch the user's email and name.
      - Creates a User row in our database.
      - All subsequent requests skip the Clerk API call (just a DB lookup).

    Returns (User, ClerkClaims) so routes can access both the internal
    user object and the raw Clerk claims (e.g. org_id, org_role).
    """
    claims = verify_clerk_jwt(credentials.credentials)

    # Look up user in our DB by their Clerk user ID
    result = await db.execute(
        select(User).where(User.clerk_user_id == claims.clerk_user_id)
    )
    user = result.scalar_one_or_none()

    if user is None:
        # First login — fetch profile from Clerk Backend API and create row
        profile = await _fetch_clerk_profile(claims.clerk_user_id)
        emails = profile.get("email_addresses", [])
        email = emails[0]["email_address"] if emails else ""
        first = profile.get("first_name") or ""
        last = profile.get("last_name") or ""
        name = f"{first} {last}".strip() or email  # fallback to email if no name

        user = User(clerk_user_id=claims.clerk_user_id, email=email, name=name)
        db.add(user)
        await db.commit()
        await db.refresh(user)

    return user, claims


async def _fetch_clerk_profile(clerk_user_id: str) -> dict:
    """
    Fetch a user profile from Clerk's Backend API.
    Only called once per user — on their very first request to this backend.
    """
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(
            f"https://api.clerk.com/v1/users/{clerk_user_id}",
            headers={"Authorization": f"Bearer {settings.CLERK_SECRET_KEY}"},
        )
    if resp.status_code != 200:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Could not verify user profile with Clerk. Please try again.",
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
