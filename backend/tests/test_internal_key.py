"""The shared secret between the Next.js server and the API (ticket 12 D62)."""
import httpx
import pytest
from pydantic import ValidationError

from app.core.config import Settings, settings
from app.main import app

SECRET = "test-shared-secret"


@pytest.fixture
def client():
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test")


async def test_missing_key_is_refused(client, monkeypatch):
    monkeypatch.setattr(settings, "INTERNAL_API_KEY", SECRET)
    response = await client.get("/api/v1/auth/me")
    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "forbidden"


async def test_wrong_key_is_refused(client, monkeypatch):
    monkeypatch.setattr(settings, "INTERNAL_API_KEY", SECRET)
    response = await client.get("/api/v1/auth/me", headers={"X-Internal-Key": "not-the-secret"})
    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "forbidden"


async def test_right_key_reaches_the_token_check(client, monkeypatch):
    monkeypatch.setattr(settings, "INTERNAL_API_KEY", SECRET)
    # Past the gate, and then refused for having no Clerk token: the gate is not identity.
    response = await client.get("/api/v1/auth/me", headers={"X-Internal-Key": SECRET})
    assert response.status_code == 401
    assert response.json()["detail"]["code"] == "invalid_token"


async def test_empty_key_turns_the_check_off(client, monkeypatch):
    monkeypatch.setattr(settings, "INTERNAL_API_KEY", "")
    response = await client.get("/api/v1/auth/me")
    assert response.status_code == 401
    assert response.json()["detail"]["code"] == "invalid_token"


def test_production_refuses_to_start_without_the_key():
    values = {"DATABASE_URL": "postgresql://test:test@localhost:5432/test", "_env_file": None}
    with pytest.raises(ValidationError):
        Settings(ENVIRONMENT="production", INTERNAL_API_KEY="", **values)
    # With the key set (or outside production) it starts normally.
    Settings(ENVIRONMENT="production", INTERNAL_API_KEY=SECRET, **values)
    Settings(ENVIRONMENT="development", INTERNAL_API_KEY="", **values)
