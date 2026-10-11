"""
app/services/clerk.py — Clerk Backend API client (Ticket 13 §4)

A thin raw-httpx client, authenticated with CLERK_SECRET_KEY. Only the calls
Trellis needs live here. Trellis is the only writer of memberships (D10), so
adding people to an org and inviting them goes through these functions.

Errors:
    503 auth_unavailable — Clerk unreachable, 5xx, or our secret key rejected
    400 clerk_rejected   — Clerk refused the request (e.g. an invalid email);
                           the message is Clerk's own explanation
"""
import logging
from typing import Optional

import httpx
from fastapi import status

from app.core.config import settings
from app.core.errors import api_error

logger = logging.getLogger(__name__)

_CLERK_API = "https://api.clerk.com/v1"


def _unavailable() -> Exception:
    return api_error(
        status.HTTP_503_SERVICE_UNAVAILABLE,
        "auth_unavailable",
        "Could not reach Clerk. Please try again.",
    )


async def _request(method: str, path: str, json: Optional[dict] = None) -> httpx.Response:
    """
    Call the Clerk Backend API. Network errors, 5xx and 401/403 (a wrong
    CLERK_SECRET_KEY is our problem, not the user's) become 503 auth_unavailable.
    Any other response is returned for the caller to check.
    """
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.request(
                method,
                f"{_CLERK_API}{path}",
                headers={"Authorization": f"Bearer {settings.CLERK_SECRET_KEY}"},
                json=json,
            )
    except httpx.HTTPError:
        logger.exception("Clerk Backend API unreachable (%s %s)", method, path)
        raise _unavailable()

    if resp.status_code >= 500 or resp.status_code in (401, 403):
        logger.error("Clerk Backend API returned %s for %s %s", resp.status_code, method, path)
        raise _unavailable()
    return resp


def _error_code(resp: httpx.Response) -> Optional[str]:
    """Clerk's machine-readable error code (`errors[0].code`), if any."""
    try:
        return resp.json()["errors"][0]["code"]
    except (ValueError, KeyError, IndexError, TypeError):
        return None


def _rejected(resp: httpx.Response, method: str, path: str) -> Exception:
    """400 clerk_rejected with Clerk's own explanation (e.g. "email_address is invalid")."""
    try:
        error = resp.json()["errors"][0]
        message = error.get("long_message") or error.get("message")
    except (ValueError, KeyError, IndexError, TypeError):
        message = None
    logger.warning("Clerk rejected %s %s (%s): %s", method, path, resp.status_code, resp.text)
    return api_error(
        status.HTTP_400_BAD_REQUEST,
        "clerk_rejected",
        message or "Clerk refused the request. Please check the details and try again.",
    )


async def _get(path: str) -> dict:
    """GET a Clerk Backend API resource; any failure becomes 503 auth_unavailable."""
    resp = await _request("GET", path)
    if resp.status_code != 200:
        logger.error("Clerk Backend API returned %s for GET %s", resp.status_code, path)
        raise _unavailable()
    return resp.json()


async def get_organization(clerk_org_id: str) -> dict:
    """The Clerk organization (`name`, `slug`, …) for a Clerk org ID."""
    return await _get(f"/organizations/{clerk_org_id}")


async def add_org_membership(clerk_org_id: str, clerk_user_id: str) -> None:
    """
    Add an existing Clerk user to the org straight away, no invite (D26).
    Clerk role is always `org:member`: Clerk roles grant nothing in Trellis (D8).
    Already a member in Clerk (e.g. joined but never opened Trellis) counts as success.
    """
    path = f"/organizations/{clerk_org_id}/memberships"
    resp = await _request("POST", path, {"user_id": clerk_user_id, "role": "org:member"})
    if resp.status_code == 200:
        return
    if _error_code(resp) == "already_a_member_in_organization":
        logger.info("Clerk user %s already in org %s", clerk_user_id, clerk_org_id)
        return
    raise _rejected(resp, "POST", path)


async def create_org_invitation(clerk_org_id: str, email: str, inviter_clerk_user_id: str) -> str:
    """
    Send a Clerk org invitation email (D10: Clerk only delivers it; the Trellis
    `invitations` row decides what the person gets). Returns Clerk's invitation ID.
    """
    path = f"/organizations/{clerk_org_id}/invitations"
    resp = await _request(
        "POST",
        path,
        {
            "email_address": email,
            "inviter_user_id": inviter_clerk_user_id,
            "role": "org:member",
            # Without this, the email link ends on Clerk's hosted page with nowhere to go.
            # Our <SignUp /> page reads the invite ticket from the link.
            "redirect_url": f"{settings.FRONTEND_URL.rstrip('/')}/sign-up",
        },
    )
    if resp.status_code != 200:
        raise _rejected(resp, "POST", path)
    return resp.json()["id"]


async def revoke_org_invitation(
    clerk_org_id: str, clerk_invitation_id: str, requesting_clerk_user_id: str
) -> None:
    """Cancel a pending Clerk invitation, so its email link stops working."""
    path = f"/organizations/{clerk_org_id}/invitations/{clerk_invitation_id}/revoke"
    resp = await _request("POST", path, {"requesting_user_id": requesting_clerk_user_id})
    if resp.status_code != 200:
        raise _rejected(resp, "POST", path)
