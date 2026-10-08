"""Clerk JWT verification (Ticket 13 A1–A4, A6)."""
import time

import pytest
from fastapi import HTTPException
from jwt.exceptions import PyJWKClientConnectionError

from app.core.auth import verify_clerk_jwt
from app.core.config import Settings
from tests.conftest import OTHER_KEY, make_token


def _rejects(token: str) -> HTTPException:
    with pytest.raises(HTTPException) as info:
        verify_clerk_jwt(token)
    return info.value


def assert_invalid_token(token: str):
    err = _rejects(token)
    assert err.status_code == 401
    assert err.detail["code"] == "invalid_token"
    # A6: one generic message; the specific reason is only logged
    assert err.detail["message"] == "Your session is invalid or has expired. Please sign in again."


# ── Valid tokens and org claims (A2) ─────────────────────────────────────────

def test_valid_token_without_org():
    claims = verify_clerk_jwt(make_token(sub="user_abc"))
    assert claims.clerk_user_id == "user_abc"
    assert claims.org_id is None
    assert claims.org_role is None


def test_v1_org_claims():
    claims = verify_clerk_jwt(make_token(org_id="org_1", org_role="org:admin"))
    assert (claims.org_id, claims.org_role) == ("org_1", "org:admin")


def test_v2_org_claims_normalize_role():
    claims = verify_clerk_jwt(make_token(v=2, o={"id": "org_2", "rol": "admin", "slg": "acme"}))
    assert (claims.org_id, claims.org_role) == ("org_2", "org:admin")


def test_v2_org_claims_win_over_v1():
    claims = verify_clerk_jwt(make_token(o={"id": "org_v2", "rol": "member"}, org_id="org_v1"))
    assert (claims.org_id, claims.org_role) == ("org_v2", "org:member")


# ── Authorized party (A1) ─────────────────────────────────────────────────────

def test_wrong_azp_rejected():
    assert_invalid_token(make_token(azp="https://evil.example"))


def test_missing_azp_accepted():
    # Same rule as Clerk's SDKs: only a present-and-unknown azp is rejected.
    assert verify_clerk_jwt(make_token(azp=None)).clerk_user_id


# ── Time and required claims (A3) ─────────────────────────────────────────────

def test_expired_rejected():
    now = int(time.time())
    assert_invalid_token(make_token(iat=now - 120, nbf=now - 120, exp=now - 30))


def test_expired_within_leeway_accepted():
    now = int(time.time())
    assert verify_clerk_jwt(make_token(iat=now - 60, nbf=now - 60, exp=now - 2))


def test_not_yet_valid_rejected():
    now = int(time.time())
    assert_invalid_token(make_token(nbf=now + 60, exp=now + 120))


@pytest.mark.parametrize("claim", ["sub", "exp", "iat", "nbf", "iss"])
def test_missing_required_claim_rejected(claim):
    assert_invalid_token(make_token(**{claim: None}))


def test_wrong_issuer_rejected():
    assert_invalid_token(make_token(iss="https://other.clerk.accounts.dev"))


# ── Signature and keys ───────────────────────────────────────────────────────

def test_bad_signature_rejected():
    assert_invalid_token(make_token(key=OTHER_KEY))


def test_unknown_kid_rejected():
    assert_invalid_token(make_token(kid="rotated-away"))


def test_malformed_token_rejected():
    assert_invalid_token("not-a-jwt")


def test_jwks_unreachable_is_503(fake_jwks, monkeypatch):
    def down():
        raise PyJWKClientConnectionError("Fail to fetch data from the url")

    monkeypatch.setattr(fake_jwks, "fetch_data", down)
    err = _rejects(make_token())
    assert err.status_code == 503
    assert err.detail["code"] == "auth_unavailable"


# ── Config (A6) ───────────────────────────────────────────────────────────────

def test_issuer_trailing_slash_normalized():
    assert Settings(CLERK_ISSUER="https://x.clerk.accounts.dev/").CLERK_ISSUER == (
        "https://x.clerk.accounts.dev"
    )
