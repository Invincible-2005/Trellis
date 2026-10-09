"""
app/services/clerk.py — Clerk Backend API client (Ticket 13 §4)

A thin raw-httpx client, authenticated with CLERK_SECRET_KEY. Only the calls
Trellis needs live here; the invitation and membership calls are added with
the invitation endpoints.
"""
import logging

import httpx
from fastapi import status

from app.core.config import settings
from app.core.errors import api_error

logger = logging.getLogger(__name__)

_CLERK_API = "https://api.clerk.com/v1"


async def _get(path: str) -> dict:
    """GET a Clerk Backend API resource; any failure becomes 503 auth_unavailable."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                f"{_CLERK_API}{path}",
                headers={"Authorization": f"Bearer {settings.CLERK_SECRET_KEY}"},
            )
    except httpx.HTTPError:
        logger.exception("Clerk Backend API unreachable (GET %s)", path)
        resp = None

    if resp is None or resp.status_code != 200:
        if resp is not None:
            logger.error("Clerk Backend API returned %s for GET %s", resp.status_code, path)
        raise api_error(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "auth_unavailable",
            "Could not reach Clerk. Please try again.",
        )
    return resp.json()


async def get_organization(clerk_org_id: str) -> dict:
    """The Clerk organization (`name`, `slug`, …) for a Clerk org ID."""
    return await _get(f"/organizations/{clerk_org_id}")
