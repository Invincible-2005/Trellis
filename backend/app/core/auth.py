"""
app/core/auth.py — Clerk JWT Verification (Ticket 03, Ticket 13 A1–A6)

Single responsibility: verify the RS256 JWT issued by Clerk and return
typed claims. Nothing else lives here.

The PyJWKClient caches Clerk's public keys in memory and auto-refreshes
only when it encounters an unknown `kid` — no manual JWKS management needed.

This function is synchronous: the first call (and any unknown `kid`) does a
blocking HTTP fetch of the JWKS. deps.py runs it via `asyncio.to_thread`.
"""
import logging
from dataclasses import dataclass
from typing import Optional

import jwt
from jwt import PyJWKClient
from jwt.exceptions import PyJWKClientConnectionError, PyJWKClientError
from fastapi import status

from app.core.config import settings
from app.core.errors import api_error

logger = logging.getLogger(__name__)

# Clock skew tolerated between Clerk and this server, in seconds.
_LEEWAY_SECONDS = 5
_REQUIRED_CLAIMS = ["sub", "exp", "iat", "nbf", "iss"]


# ── Typed payload returned from a verified Clerk JWT ─────────────────────────

@dataclass(frozen=True)
class ClerkClaims:
    """Verified, typed payload extracted from a Clerk-issued JWT."""
    clerk_user_id: str          # `sub` claim — Clerk's unique user ID
    org_id: Optional[str]       # v2 `o.id` / v1 `org_id` — None if no active org
    org_role: Optional[str]     # normalized to "org:<role>", e.g. "org:admin"


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


# ── Helpers ───────────────────────────────────────────────────────────────────

def _invalid_token():
    # One generic message for every rejection; the real reason is only logged (A6).
    return api_error(
        status.HTTP_401_UNAUTHORIZED,
        "invalid_token",
        "Your session is invalid or has expired. Please sign in again.",
        headers={"WWW-Authenticate": "Bearer"},
    )


def _org_claims(payload: dict) -> tuple[Optional[str], Optional[str]]:
    """
    Read the active org from a v2 (`o: {id, rol}`) or v1 (`org_id`, `org_role`)
    session token (A2). v2 roles drop the "org:" prefix, so it is restored here.
    """
    org = payload.get("o")
    if isinstance(org, dict) and org.get("id"):
        org_id, role = org["id"], org.get("rol")
    else:
        org_id, role = payload.get("org_id"), payload.get("org_role")

    if role and not role.startswith("org:"):
        role = f"org:{role}"
    return org_id, role


# ── Public verifier ───────────────────────────────────────────────────────────

def verify_clerk_jwt(token: str) -> ClerkClaims:
    """
    Verify a Clerk-issued JWT and return its typed claims.

    Called by get_current_user() in deps.py — never call this directly from a router.

    Raises:
        HTTP 401 invalid_token     — expired, not yet valid, bad signature, wrong
                                     issuer, disallowed `azp`, missing claims.
        HTTP 503 auth_unavailable  — Clerk's JWKS endpoint is unreachable.
        RuntimeError               — CLERK_ISSUER not configured (startup misconfiguration).
    """
    try:
        signing_key = _get_jwks_client().get_signing_key_from_jwt(token)
        payload = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            issuer=settings.CLERK_ISSUER,
            leeway=_LEEWAY_SECONDS,
            options={"require": _REQUIRED_CLAIMS},
        )
    except PyJWKClientConnectionError:
        logger.exception("Could not fetch Clerk JWKS")
        raise api_error(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "auth_unavailable",
            "Sign-in is temporarily unavailable. Please try again shortly.",
        )
    except (PyJWKClientError, jwt.InvalidTokenError) as exc:
        # PyJWKClientError here means no key matches the token's `kid`: a bad token.
        logger.info("Rejected Clerk JWT: %s", exc)
        raise _invalid_token()

    # `azp` is the origin that requested the token. Like Clerk's own SDKs, a token
    # without `azp` is accepted; one from an unknown origin is not (A1).
    azp = payload.get("azp")
    if azp and azp not in settings.CLERK_AUTHORIZED_PARTIES:
        logger.info("Rejected Clerk JWT: azp %r not in CLERK_AUTHORIZED_PARTIES", azp)
        raise _invalid_token()

    org_id, org_role = _org_claims(payload)
    return ClerkClaims(
        clerk_user_id=payload["sub"],
        org_id=org_id,
        org_role=org_role,
    )
