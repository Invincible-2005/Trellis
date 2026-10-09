"""
app/services/orgs.py — Setting up a new workspace (Ticket 12 D10, Ticket 13 §5)

Clerk org creation → /onboarding → POST /api/v1/orgs/provision → provision_org().
One transaction creates the org, its protected root Admin role and the
creator's membership with that role. Calling it again changes nothing.
"""
import logging
import uuid
from dataclasses import dataclass

from fastapi import status
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import ClerkClaims
from app.core.errors import api_error
from app.models.organization import Organization, OrgMember
from app.models.role import ROLE_PERMISSIONS, Role
from app.models.user import User
from app.scope.resolver import invalidate_scope
from app.services import clerk

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class ProvisionResult:
    org: Organization
    admin_role_id: uuid.UUID
    created: bool       # False if the org was already set up


async def provision_org(db: AsyncSession, user: User, claims: ClerkClaims) -> ProvisionResult:
    """
    Set up the token's active Clerk org in Trellis (idempotent).

    Raises:
        400 no_active_org     — no org selected in Clerk
        403 forbidden         — org not set up yet and the caller isn't its Clerk admin
        503 auth_unavailable  — Clerk Backend API unreachable (org name lookup)
    """
    # The org always comes from the verified token, never the request body (D10).
    if not claims.org_id:
        raise api_error(
            status.HTTP_400_BAD_REQUEST,
            "no_active_org",
            "Select or create an organization first.",
        )

    # Already set up: anyone in the org just passes through /onboarding.
    existing = await _existing(db, claims.org_id)
    if existing is not None:
        return existing

    # The one place a Clerk org role counts: only the org's creator/admin in Clerk
    # may set it up. Everywhere else, permissions come from Trellis (D8, ticket 03 §2).
    if claims.org_role != "org:admin":
        raise api_error(
            status.HTTP_403_FORBIDDEN,
            "forbidden",
            "This workspace isn't set up yet. Ask the person who created it to open Trellis first.",
        )

    clerk_org = await clerk.get_organization(claims.org_id)
    name = clerk_org.get("name") or "Untitled workspace"

    # A double page load can race here: ON CONFLICT lets exactly one call create the org.
    org_id = await db.scalar(
        pg_insert(Organization)
        .values(id=uuid.uuid4(), name=name, clerk_org_id=claims.org_id, created_by_user_id=user.id)
        .on_conflict_do_nothing(index_elements=[Organization.clerk_org_id])
        .returning(Organization.id)
    )
    if org_id is None:
        await db.rollback()
        existing = await _existing(db, claims.org_id)
        if existing is None:  # pragma: no cover — the conflicting row guarantees one
            raise RuntimeError(f"Org {claims.org_id} missing after insert conflict")
        return existing

    admin = Role(
        id=uuid.uuid4(),
        org_id=org_id,
        name="Admin",
        description="Workspace owner. Holds every permission and can't be deleted.",
        parent_role_id=None,
        permissions=list(ROLE_PERMISSIONS),
        is_system=True,
        created_by_user_id=user.id,
    )
    db.add(admin)
    db.add(OrgMember(id=uuid.uuid4(), org_id=org_id, user_id=user.id, role_id=admin.id))
    await db.commit()

    invalidate_scope(user.id, org_id)
    logger.info("Provisioned org %s (%s) for user %s", org_id, claims.org_id, user.id)

    org = await db.get(Organization, org_id)
    return ProvisionResult(org=org, admin_role_id=admin.id, created=True)


async def _existing(db: AsyncSession, clerk_org_id: str) -> ProvisionResult | None:
    """The already-set-up org and its root Admin role, or None."""
    org = await db.scalar(select(Organization).where(Organization.clerk_org_id == clerk_org_id))
    if org is None:
        return None
    admin_role_id = await db.scalar(
        select(Role.id).where(Role.org_id == org.id, Role.is_system.is_(True))
    )
    return ProvisionResult(org=org, admin_role_id=admin_role_id, created=False)
