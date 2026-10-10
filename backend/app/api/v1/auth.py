"""
app/api/v1/auth.py — Who am I, and what can I do here? (Ticket 05 §1, Ticket 13 §5)

Both routes are identity-only: they work before an org is selected or set up,
so they never return 400 no_active_org / 409 org_not_provisioned.
"""
import uuid
from typing import Optional

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.core.auth import ClerkClaims
from app.core.database import get_db
from app.core.deps import ensure_org_member, get_current_user, lookup_org_id
from app.core.errors import error_responses
from app.models.invitation import Invitation
from app.models.organization import Organization, OrgMember
from app.models.role import Role
from app.models.team import Team
from app.models.user import User
from app.schemas.auth import (
    ActiveOrgPermissions,
    AuthContextResponse,
    AuthMeResponse,
    InvitationResponse,
    OrgSummary,
)
from app.scope.resolver import AccessScope, resolve_scope

router = APIRouter(prefix="/auth", tags=["auth"])

# Errors any identity route can return (bad token, Clerk down, first-login email problems)
_IDENTITY_ERRORS = error_responses(400, 401, 409, 503)


@router.get("/me", response_model=AuthMeResponse, responses=_IDENTITY_ERRORS)
async def me(
    ctx: tuple[User, ClerkClaims] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AuthMeResponse:
    """The signed-in user. `active_org_id` is set once the active org is set up in Trellis."""
    user, claims = ctx
    active_org_id = await lookup_org_id(db, claims.org_id) if claims.org_id else None
    return AuthMeResponse(
        user_id=user.id,
        clerk_user_id=user.clerk_user_id,
        email=user.email,
        name=user.name,
        active_org_id=active_org_id,
    )


@router.get("/context", response_model=AuthContextResponse, responses=_IDENTITY_ERRORS)
async def context(
    ctx: tuple[User, ClerkClaims] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AuthContextResponse:
    """
    The user's orgs, pending invitations, and — if the active org is set up —
    their effective permissions there. The frontend uses this to show or hide
    navigation and the admin console.
    """
    user, claims = ctx

    active_org: Optional[ActiveOrgPermissions] = None
    org_id = await lookup_org_id(db, claims.org_id) if claims.org_id else None
    if org_id is not None:
        # Same just-in-time membership as data routes, so the active org is listed below.
        await ensure_org_member(db, user, org_id)
        scope = await resolve_scope(user_id=user.id, org_id=org_id, db=db)
        active_org = await _active_org_permissions(db, scope)

    return AuthContextResponse(
        organizations=await _my_orgs(db, user.id),
        pending_invitations=await _pending_invitations(db, user.email),
        active_org=active_org,
    )


# ── Queries (only ever about the signed-in user) ─────────────────────────────

async def _my_orgs(db: AsyncSession, user_id: uuid.UUID) -> list[OrgSummary]:
    result = await db.execute(
        select(Organization)
        .join(OrgMember, OrgMember.org_id == Organization.id)
        .where(OrgMember.user_id == user_id)
        .order_by(Organization.name)
    )
    return [OrgSummary.model_validate(org) for org in result.scalars()]


async def _pending_invitations(db: AsyncSession, email: str) -> list[InvitationResponse]:
    inviter = aliased(User)
    result = await db.execute(
        select(
            Invitation,
            Organization.name.label("org_name"),
            Team.name.label("team_name"),
            Role.name.label("role_name"),
            inviter.name.label("invited_by_name"),
        )
        .join(Organization, Organization.id == Invitation.org_id)
        # Team and role are optional: invites from Admin → Members join the org only (D25)
        .outerjoin(Team, Team.id == Invitation.team_id)
        .outerjoin(Role, Role.id == Invitation.role_id)
        .join(inviter, inviter.id == Invitation.invited_by_user_id)
        .where(func.lower(Invitation.email) == email.lower(), Invitation.status == "pending")
        .order_by(Invitation.created_at.desc())
    )
    return [
        InvitationResponse(
            id=inv.id,
            email=inv.email,
            org_id=inv.org_id,
            org_name=row.org_name,
            team_id=inv.team_id,
            team_name=row.team_name,
            role_id=inv.role_id,
            role_name=row.role_name,
            invited_by_name=row.invited_by_name,
            status=inv.status,
            created_at=inv.created_at,
        )
        for row in result
        for inv in [row.Invitation]
    ]


async def _active_org_permissions(db: AsyncSession, scope: AccessScope) -> ActiveOrgPermissions:
    org_role = (
        await db.execute(
            select(Role.id, Role.name)
            .join(OrgMember, OrgMember.role_id == Role.id)
            .where(OrgMember.user_id == scope.user_id, OrgMember.org_id == scope.org_id)
        )
    ).first()

    tabs = _admin_tabs(scope)
    return ActiveOrgPermissions(
        org_id=scope.org_id,
        org_role_id=org_role.id if org_role else None,
        org_role_name=org_role.name if org_role else None,
        org_permissions=sorted(scope.org_permissions),
        permissions_by_team={
            team_id: sorted(perms) for team_id, perms in scope.permissions_by_team.items()
        },
        member_team_ids=sorted(scope.member_team_ids),
        viewable_team_ids=sorted(scope.viewable_team_ids),
        admin_tabs=tabs,
        can_open_admin=bool(tabs),
    )


def _admin_tabs(scope: AccessScope) -> list[str]:
    """
    Admin console tabs the user may open (D4 + follow-up 2026-10-09). Each tab's
    own permission, org-wide; upload_document also counts on any team, so a team
    manager can upload their team's documents. The backend checks every action anyway.
    No Teams tab: teams have their own /teams pages (D28).
    """
    tabs = []
    if scope.can_org("create_role"):
        tabs.append("roles")
    if scope.can_org("add_member"):
        tabs.append("members")
    if scope.can_org("upload_document") or any(
        "upload_document" in perms for perms in scope.permissions_by_team.values()
    ):
        tabs.append("documents")
    if scope.can_org("review_strike"):
        tabs.append("strikes")
    return tabs
