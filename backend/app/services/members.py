"""
app/services/members.py — Org members and invitations (Ticket 12 D10/D25/D26)

Admin → Members lists everyone in the org plus pending invites, and adds people
by email with an optional org-level role:
  - the email belongs to a Trellis user → added straight away (Clerk membership,
    then org_members), D26;
  - otherwise → a pending Trellis invitation (what they get) plus a Clerk
    invitation (the email), applied on the invitee's first request, D10-B.

Cancelling a pending invite revokes it in Clerk first (so the email link stops
working), then deletes the Trellis row.

Trellis is the only writer of memberships (D10): Clerk first, then the database.
"""
import logging
import uuid

from fastapi import status
from sqlalchemy import delete, func, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.core.errors import api_error
from app.models.invitation import Invitation
from app.models.organization import Organization, OrgMember
from app.models.role import Role
from app.models.team import TeamMember
from app.models.user import User
from app.schemas.admin import AddMemberRequest, AddMemberResponse, MemberListResponse, MemberResponse
from app.schemas.auth import InvitationResponse
from app.scope.resolver import AccessScope, invalidate_scope
from app.services import clerk

logger = logging.getLogger(__name__)


async def list_members(db: AsyncSession, scope: AccessScope) -> MemberListResponse:
    """Everyone in the org with their org-level role, plus pending invitations."""
    _require_member_admin(scope)

    rows = await db.execute(
        select(OrgMember, User, Role.name.label("role_name"))
        .join(User, User.id == OrgMember.user_id)
        .outerjoin(Role, Role.id == OrgMember.role_id)
        .where(OrgMember.org_id == scope.org_id)
        .order_by(func.lower(User.name))
    )
    members = [_member_response(row.OrgMember, row.User, row.role_name) for row in rows]
    return MemberListResponse(members=members, invitations=await _pending_invitations(db, scope.org_id))


async def add_member(db: AsyncSession, scope: AccessScope, body: AddMemberRequest) -> AddMemberResponse:
    """
    Add a person to the org, or invite them if they've never used Trellis (D26).

    Raises:
        403 forbidden        — no org-wide add_member, or a role the caller can't give
        404 role_not_found   — role isn't in this org
        409 already_member   — the email is already in the org
        409 already_invited  — a pending invite exists for the email
        400 clerk_rejected   — Clerk refused (e.g. an invalid email)
        503 auth_unavailable — Clerk unreachable
    """
    _require_member_admin(scope)
    email = body.email  # already trimmed and lowercased by the schema

    role = None
    if body.role_id is not None:
        role = await _get_assignable_role(db, scope, body.role_id)

    member_exists = await db.scalar(
        select(OrgMember.id)
        .join(User, User.id == OrgMember.user_id)
        .where(OrgMember.org_id == scope.org_id, func.lower(User.email) == email)
    )
    if member_exists:
        raise api_error(
            status.HTTP_409_CONFLICT, "already_member", f"{email} is already in this organization."
        )
    if await _has_pending_invite(db, scope.org_id, email):
        raise _already_invited(email)

    clerk_org_id = await db.scalar(
        select(Organization.clerk_org_id).where(Organization.id == scope.org_id)
    )
    user = await db.scalar(select(User).where(func.lower(User.email) == email))

    if user is not None:
        return await _add_existing_user(db, scope, clerk_org_id, user, role)
    return await _invite(db, scope, clerk_org_id, email, role)


async def apply_pending_invitations(db: AsyncSession, user: User, org_id: uuid.UUID) -> None:
    """
    Turn the user's pending invitations for this org into what they promised (D10-B):
    an org-only invite sets the org-level role, a team invite adds a team membership.
    Called once, right after the user's org_members row is created just-in-time.
    The caller commits and invalidates the scope.
    """
    invites = (
        await db.scalars(
            select(Invitation).where(
                Invitation.org_id == org_id,
                Invitation.email == user.email.lower(),
                Invitation.status == "pending",
            )
        )
    ).all()

    for invite in invites:
        if invite.team_id is None:
            if invite.role_id is not None:
                await db.execute(
                    update(OrgMember)
                    .where(OrgMember.org_id == org_id, OrgMember.user_id == user.id)
                    .values(role_id=invite.role_id)
                )
        elif invite.role_id is not None:
            await db.execute(
                pg_insert(TeamMember)
                .values(id=uuid.uuid4(), team_id=invite.team_id, user_id=user.id, role_id=invite.role_id)
                .on_conflict_do_nothing(index_elements=[TeamMember.team_id, TeamMember.user_id])
            )
        invite.status = "accepted"
        logger.info("Applied invitation %s for user %s in org %s", invite.id, user.id, org_id)


async def cancel_invitation(db: AsyncSession, scope: AccessScope, invitation_id: uuid.UUID) -> None:
    """
    Take back a pending invite: Clerk first, then the Trellis row is deleted.

    Raises:
        403 forbidden            — no org-wide add_member, or the invite's role isn't below the caller
        404 invitation_not_found — no pending invite with this ID in the org (or already used)
        400 clerk_rejected       — Clerk refused (e.g. the person already accepted it)
        503 auth_unavailable     — Clerk unreachable
    """
    _require_member_admin(scope)

    invite = await db.scalar(
        select(Invitation).where(
            Invitation.id == invitation_id,
            Invitation.org_id == scope.org_id,
            Invitation.status == "pending",
        )
    )
    if invite is None:
        raise api_error(
            status.HTTP_404_NOT_FOUND,
            "invitation_not_found",
            "That invitation doesn't exist or has already been used.",
        )
    # Act only on roles below your own (D9): an invite with no role is anyone's to cancel.
    if invite.role_id is not None and not scope.can_manage_role(invite.role_id):
        raise api_error(
            status.HTTP_403_FORBIDDEN,
            "forbidden",
            "You can only cancel invitations for roles below your own.",
        )

    if invite.clerk_invitation_id:
        clerk_org_id = await db.scalar(
            select(Organization.clerk_org_id).where(Organization.id == scope.org_id)
        )
        requester_clerk_id = await db.scalar(select(User.clerk_user_id).where(User.id == scope.user_id))
        await clerk.revoke_org_invitation(clerk_org_id, invite.clerk_invitation_id, requester_clerk_id)

    await db.execute(delete(Invitation).where(Invitation.id == invite.id))
    await db.commit()
    logger.info("User %s cancelled invitation %s (%s) in org %s", scope.user_id, invite.id, invite.email, scope.org_id)


# ── The two paths ─────────────────────────────────────────────────────────────

async def _add_existing_user(
    db: AsyncSession, scope: AccessScope, clerk_org_id: str, user: User, role: Role | None
) -> AddMemberResponse:
    """D26: has signed into Trellis before → Clerk membership, then org_members."""
    await clerk.add_org_membership(clerk_org_id, user.clerk_user_id)

    role_id = role.id if role else None
    # A conflict means their just-in-time row appeared in the meantime: give it the role.
    result = await db.execute(
        pg_insert(OrgMember)
        .values(id=uuid.uuid4(), org_id=scope.org_id, user_id=user.id, role_id=role_id)
        .on_conflict_do_update(
            index_elements=[OrgMember.org_id, OrgMember.user_id], set_={"role_id": role_id}
        )
        .returning(OrgMember)
    )
    membership = result.scalar_one()
    await db.commit()
    invalidate_scope(user.id, scope.org_id)
    logger.info("User %s added user %s to org %s", scope.user_id, user.id, scope.org_id)

    return AddMemberResponse(
        status="added", member=_member_response(membership, user, role.name if role else None)
    )


async def _invite(
    db: AsyncSession, scope: AccessScope, clerk_org_id: str, email: str, role: Role | None
) -> AddMemberResponse:
    """New to Trellis → pending invitation row, then the Clerk email, then link the two."""
    invite = Invitation(
        id=uuid.uuid4(),
        email=email,
        org_id=scope.org_id,
        team_id=None,
        role_id=role.id if role else None,
        invited_by_user_id=scope.user_id,
        status="pending",
    )
    db.add(invite)
    try:
        await db.flush()  # the unique pending index stops a double-click here
    except IntegrityError:
        await db.rollback()
        raise _already_invited(email)

    inviter_clerk_id = await db.scalar(select(User.clerk_user_id).where(User.id == scope.user_id))
    try:
        invite.clerk_invitation_id = await clerk.create_org_invitation(
            clerk_org_id, email, inviter_clerk_id
        )
    except Exception:
        await db.rollback()  # no Clerk email, so no Trellis invite either
        raise
    await db.commit()
    logger.info("User %s invited %s to org %s (invitation %s)", scope.user_id, email, scope.org_id, invite.id)

    invitations = await _pending_invitations(db, scope.org_id, invite.id)
    return AddMemberResponse(status="invited", invitation=invitations[0])


# ── Checks ────────────────────────────────────────────────────────────────────

def _require_member_admin(scope: AccessScope) -> None:
    """Inviting into the org needs add_member on the ORG-LEVEL role (D9, D25)."""
    if not scope.can_org("add_member"):
        raise api_error(
            status.HTTP_403_FORBIDDEN,
            "forbidden",
            "You don't have permission to add members.",
        )


async def _get_assignable_role(db: AsyncSession, scope: AccessScope, role_id: uuid.UUID) -> Role:
    """A role in this org, strictly below the caller (D17), holding only permissions they have (D9)."""
    role = await db.scalar(select(Role).where(Role.id == role_id, Role.org_id == scope.org_id))
    if role is None:
        raise api_error(status.HTTP_404_NOT_FOUND, "role_not_found", "That role doesn't exist.")
    if not scope.can_manage_role(role.id):
        raise api_error(
            status.HTTP_403_FORBIDDEN, "forbidden", "You can only give roles below your own."
        )
    lacking = sorted(set(role.permissions or []) - scope.org_permissions)
    if lacking:
        raise api_error(
            status.HTTP_403_FORBIDDEN,
            "forbidden",
            f"You can't give the {role.name} role: it has permissions you don't have ({', '.join(lacking)}).",
        )
    return role


async def _has_pending_invite(db: AsyncSession, org_id: uuid.UUID, email: str) -> bool:
    return bool(
        await db.scalar(
            select(Invitation.id).where(
                Invitation.org_id == org_id, Invitation.email == email, Invitation.status == "pending"
            )
        )
    )


def _already_invited(email: str) -> Exception:
    return api_error(
        status.HTTP_409_CONFLICT, "already_invited", f"{email} has already been invited."
    )


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _pending_invitations(
    db: AsyncSession, org_id: uuid.UUID, invitation_id: uuid.UUID | None = None
) -> list[InvitationResponse]:
    """Pending invites for the org (or just one), newest first."""
    inviter = aliased(User)
    query = (
        select(
            Invitation,
            Organization.name.label("org_name"),
            Role.name.label("role_name"),
            inviter.name.label("invited_by_name"),
        )
        .join(Organization, Organization.id == Invitation.org_id)
        .outerjoin(Role, Role.id == Invitation.role_id)
        .join(inviter, inviter.id == Invitation.invited_by_user_id)
        .where(Invitation.org_id == org_id, Invitation.status == "pending")
        .order_by(Invitation.created_at.desc())
    )
    if invitation_id is not None:
        query = query.where(Invitation.id == invitation_id)

    result = await db.execute(query)
    return [
        InvitationResponse(
            id=inv.id,
            email=inv.email,
            org_id=inv.org_id,
            org_name=row.org_name,
            team_id=inv.team_id,
            role_id=inv.role_id,
            role_name=row.role_name,
            invited_by_name=row.invited_by_name,
            status=inv.status,
            created_at=inv.created_at,
        )
        for row in result
        for inv in [row.Invitation]
    ]


def _member_response(membership: OrgMember, user: User, role_name: str | None) -> MemberResponse:
    return MemberResponse(
        user_id=user.id,
        name=user.name,
        email=user.email,
        org_role_id=membership.role_id,
        org_role_name=role_name,
        joined_at=membership.joined_at,
    )
