"""
app/core/auth.py — Clerk JWT Verification (Ticket 03)

Single responsibility: verify the RS256 JWT issued by Clerk and return
typed claims. Nothing else lives here.

The PyJWKClient caches Clerk's public keys in memory and auto-refreshes
only when it encounters an unknown `kid` — no manual JWKS management needed.
"""
from dataclasses import dataclass
from typing import Optional

import jwt
from jwt import PyJWKClient
from fastapi import HTTPException, status

from app.core.config import settings


# ── Typed payload returned from a verified Clerk JWT ─────────────────────────

@dataclass(frozen=True)
class ClerkClaims:
    """Verified, typed payload extracted from a Clerk-issued JWT."""
    clerk_user_id: str          # `sub` claim — Clerk's unique user ID
    org_id: Optional[str]       # `org_id` claim — None if user has no active org
    org_role: Optional[str]     # `org_role` claim — e.g. "org:admin", "org:member"


# ── JWKS client (module-level singleton — instantiated once at startup) ───────

_jwks_client: Optional[PyJWKClient] = None


def _get_jwks_client() -> PyJWKClient:
    """
    Lazily initialise the JWKS client so that a missing CLERK_ISSUER env var
    does not crash the app at import time during tests or local dev without Clerk.
    """
    global _jwks_client
    if _jwks_client is None:
        if not settings.CLERK_ISSUER:
            raise RuntimeError(
                "CLERK_ISSUER is not set. "
                "Add it to your .env file (Clerk Dashboard → API Keys → Frontend API URL)."
            )
        _jwks_client = PyJWKClient(
            f"{settings.CLERK_ISSUER}/.well-known/jwks.json",
            cache_keys=True,
        )
    return _jwks_client


# ── Public verifier ───────────────────────────────────────────────────────────

def verify_clerk_jwt(token: str) -> ClerkClaims:
    """
    Verify a Clerk-issued JWT and return its typed claims.

    Called by get_scope() in deps.py — never call this directly from a router.

    Raises:
        HTTP 401 — expired token, bad signature, wrong issuer, missing subject.
        RuntimeError — CLERK_ISSUER not configured (startup misconfiguration).
    """
    try:
        client = _get_jwks_client()
        signing_key = client.get_signing_key_from_jwt(token)
        payload = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            issuer=settings.CLERK_ISSUER,
            options={"require": ["sub", "exp", "iat"]},
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired. Please sign in again.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except jwt.InvalidTokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid token: {exc}",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return ClerkClaims(
        clerk_user_id=payload["sub"],
        org_id=payload.get("org_id"),       # None when user has no active org
        org_role=payload.get("org_role"),   # None when user has no active org
    )
