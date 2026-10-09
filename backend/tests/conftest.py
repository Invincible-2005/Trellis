"""
Shared test fixtures: a throwaway RS256 key, a fake Clerk JWKS, and a token factory.
No test talks to Clerk or Neon.
"""
import os
import time
import uuid

# Settings() needs a DATABASE_URL at import time; the engine never connects in unit tests.
os.environ.setdefault("DATABASE_URL", "postgresql://test:test@localhost:5432/test")

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from jwt import PyJWKClient
from jwt.algorithms import RSAAlgorithm

from app.core import auth
from app.core.config import settings

ISSUER = "https://test-instance.clerk.accounts.dev"
ORIGIN = "http://localhost:3000"
KID = "test-key"


def _rsa_key():
    return rsa.generate_private_key(public_exponent=65537, key_size=2048)


SIGNING_KEY = _rsa_key()
OTHER_KEY = _rsa_key()  # same kid, different key → bad signature


def _jwk(private_key, kid: str) -> dict:
    jwk = RSAAlgorithm.to_jwk(private_key.public_key(), as_dict=True)
    jwk.update({"kid": kid, "alg": "RS256", "use": "sig"})
    return jwk


@pytest.fixture(autouse=True)
def clear_caches():
    """Scope, org-ID and membership caches are module-level; isolate every test."""
    from app.core import deps
    from app.scope import resolver

    for cache in (resolver._scope_cache, deps._org_id_cache, deps._known_members):
        cache.clear()
    yield


@pytest.fixture(autouse=True)
def clerk_settings(monkeypatch):
    monkeypatch.setattr(settings, "CLERK_ISSUER", ISSUER)
    monkeypatch.setattr(settings, "CLERK_AUTHORIZED_PARTIES", [ORIGIN])


@pytest.fixture(autouse=True)
def fake_jwks(monkeypatch):
    """Replace the JWKS client with one that serves our test key instead of Clerk's."""
    client = PyJWKClient(f"{ISSUER}/.well-known/jwks.json", cache_keys=False)
    monkeypatch.setattr(client, "fetch_data", lambda: {"keys": [_jwk(SIGNING_KEY, KID)]})
    monkeypatch.setattr(auth, "_jwks_client", client)
    return client


def make_token(key=SIGNING_KEY, kid: str = KID, **overrides) -> str:
    """
    Build a Clerk-like session token. Pass a claim as None to drop it.
    Defaults: valid for 60 s, issued by ISSUER, `azp` = ORIGIN, no active org.
    """
    now = int(time.time())
    claims = {
        "sub": f"user_{uuid.uuid4().hex[:12]}",
        "iss": ISSUER,
        "azp": ORIGIN,
        "iat": now,
        "nbf": now,
        "exp": now + 60,
    }
    claims.update(overrides)
    claims = {k: v for k, v in claims.items() if v is not None}
    return jwt.encode(claims, key, algorithm="RS256", headers={"kid": kid})
