"""
app/services/roles.py — The org's role tree (Ticket 12 D9/D17, Ticket 05 §2/§7)

"Below you" always means below the caller's ORG-LEVEL role (D17); team roles
never count. Every role write calls invalidate_org(): roles above a changed role
see documents tagged to it, so everyone's cached scope may be stale.
"""
import logging
import uuid
from typing import Mapping, Optional

from fastapi import status
from sqlalchemy import delete, exists, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import api_error
from app.models.document import Document
from app.models.invitation import Invitation
from app.models.organization import OrgMember
from app.models.role import Role
from app.models.team import TeamMember
from app.schemas.admin import CreateRoleRequest, RoleResponse, UpdateRoleRequest
from app.scope.resolver import AccessScope, invalidate_org

logger = logging.getLogger(__name__)


async def list_roles(db: AsyncSession, scope: AccessScope) -> list[RoleResponse]:
    """Every role in the org as a flat list with depth (the frontend builds the tree)."""
    if not (scope.can_org("create_role") or scope.can_org("add_member")):
        raise api_error(
            status.HTTP_403_FORBIDDEN,
            "forbidden",
            "You don't have access to the admin console.",
        )

    roles = (
        await db.scalars(
            select(Role).where(Role.org_id == scope.org_id).order_by(Role.created_at)
        )
    ).all()
    depth = _depths({role.id: role.parent_role_id for role in roles})
    return [_to_response(role, depth[role.id], scope.can_manage_role(role.id)) for role in roles]


async def create_role(db: AsyncSession, scope: AccessScope, body: CreateRoleRequest) -> RoleResponse:
    """
    Create a role strictly below the caller's org-level role.

    Raises:
        403 forbidden        — no org-wide create_role, parent not at or below the
                               caller's role, or granting a permission they lack
        404 role_not_found   — parent isn't a role in this org
        409 role_name_taken  — another role in the org has this name
    """
    _require_role_admin(scope)

    parent = await _get_role(db, scope.org_id, body.parent_role_id)
    # The parent is your own role or one below it, so the new role sits strictly below you.
    _require_parent_allowed(scope, parent.id)

    permissions = sorted(set(body.permissions))
    _require_can_grant(scope, permissions)

    await _ensure_name_free(db, scope.org_id, body.name)

    role = Role(
        id=uuid.uuid4(),
        org_id=scope.org_id,
        name=body.name,
        description=body.description,
        parent_role_id=parent.id,
        permissions=permissions,
        is_system=False,
        created_by_user_id=scope.user_id,
    )
    db.add(role)
    await db.commit()
    invalidate_org(scope.org_id)
    logger.info("User %s created role %s (%s) in org %s", scope.user_id, role.id, role.name, scope.org_id)

    tree = await _parent_map(db, scope.org_id)
    # Below the caller by construction; the cached scope just doesn't know the new id yet.
    return _to_response(role, _depths(tree)[role.id], manageable=True)


async def update_role(
    db: AsyncSession,
    scope: AccessScope,
    role_id: uuid.UUID,
    body: UpdateRoleRequest,
) -> RoleResponse:
    """
    Rename, re-describe, move or change the permissions of a role below the caller.

    Raises:
        400 invalid_parent   — moving the role under itself or one of its own children
        403 forbidden        — no org-wide create_role, the Admin role, a role not below
                               the caller, a new parent not at or below the caller, or
                               adding a permission the caller lacks
        404 role_not_found   — the role or the new parent isn't in this org
        409 role_name_taken  — another role in the org has the new name
    """
    _require_role_admin(scope)
    role = await _get_changeable_role(db, scope, role_id)

    if body.parent_role_id is not None and body.parent_role_id != role.parent_role_id:
        parent = await _get_role(db, scope.org_id, body.parent_role_id)
        _require_parent_allowed(scope, parent.id)
        tree = await _parent_map(db, scope.org_id)
        if parent.id == role.id or role.id in _ancestors(parent.id, tree):
            raise api_error(
                status.HTTP_400_BAD_REQUEST,
                "invalid_parent",
                "A role can't be moved under itself or one of its own sub-roles.",
            )
        role.parent_role_id = parent.id  # its whole subtree moves with it

    if body.permissions is not None:
        permissions = sorted(set(body.permissions))
        # Only ADDED permissions must be yours; removing is always allowed (D17).
        _require_can_grant(scope, [p for p in permissions if p not in (role.permissions or [])])
        role.permissions = permissions

    if body.name is not None and body.name != role.name:
        await _ensure_name_free(db, scope.org_id, body.name, exclude_role_id=role.id)
        role.name = body.name

    if body.description is not None:
        role.description = body.description or None

    await db.commit()
    invalidate_org(scope.org_id)
    logger.info("User %s updated role %s in org %s", scope.user_id, role.id, scope.org_id)

    tree = await _parent_map(db, scope.org_id)
    return _to_response(role, _depths(tree)[role.id], manageable=True)


# What still points at a role, and how to say so to the user.
_ROLE_USES = (
    (OrgMember.role_id, "someone holds it as their org-wide role"),
    (TeamMember.role_id, "someone holds it in a team"),
    (Invitation.role_id, "an invitation uses it"),
    (Document.role_id, "a document is shared with it"),
)


async def delete_role(db: AsyncSession, scope: AccessScope, role_id: uuid.UUID) -> None:
    """
    Delete an unused role below the caller.

    Raises:
        403 forbidden          — no org-wide create_role, the Admin role, or a role not below the caller
        404 role_not_found     — the role isn't in this org
        409 role_has_children  — other roles sit under it
        409 role_in_use        — a member, invitation or document still uses it
    """
    _require_role_admin(scope)
    role = await _get_changeable_role(db, scope, role_id)

    if await db.scalar(select(exists().where(Role.parent_role_id == role.id))):
        raise api_error(
            status.HTTP_409_CONFLICT,
            "role_has_children",
            "Move or delete the roles under this one first.",
        )
    for column, reason in _ROLE_USES:
        if await db.scalar(select(exists().where(column == role.id))):
            raise api_error(
                status.HTTP_409_CONFLICT,
                "role_in_use",
                f"This role can't be deleted: {reason}.",
            )

    # A plain DELETE: no ORM relationship loading (children are already known to be empty).
    await db.execute(delete(Role).where(Role.id == role.id))
    await db.commit()
    invalidate_org(scope.org_id)
    logger.info("User %s deleted role %s (%s) in org %s", scope.user_id, role.id, role.name, scope.org_id)


# ── Checks ────────────────────────────────────────────────────────────────────

def _require_role_admin(scope: AccessScope) -> None:
    """Role changes need create_role on the ORG-LEVEL role (D4/D17)."""
    if not scope.can_org("create_role"):
        raise api_error(
            status.HTTP_403_FORBIDDEN,
            "forbidden",
            "You don't have permission to manage roles.",
        )


def _require_parent_allowed(scope: AccessScope, parent_id: uuid.UUID) -> None:
    """A parent must be the caller's own org role or a role below it."""
    if parent_id != scope.org_role_id and not scope.can_manage_role(parent_id):
        raise api_error(
            status.HTTP_403_FORBIDDEN,
            "forbidden",
            "You can only place roles below your own.",
        )


def _require_can_grant(scope: AccessScope, permissions: list[str]) -> None:
    """No privilege escalation: you can only hand out permissions you hold (D9)."""
    lacking = [p for p in permissions if p not in scope.org_permissions]
    if lacking:
        raise api_error(
            status.HTTP_403_FORBIDDEN,
            "forbidden",
            f"You can't grant permissions you don't have: {', '.join(lacking)}.",
        )


async def _get_changeable_role(db: AsyncSession, scope: AccessScope, role_id: uuid.UUID) -> Role:
    """A role in this org that the caller may edit or delete."""
    role = await _get_role(db, scope.org_id, role_id)
    if role.is_system:
        raise api_error(
            status.HTTP_403_FORBIDDEN,
            "forbidden",
            "The Admin role can't be changed or deleted.",
        )
    if not scope.can_manage_role(role.id):
        raise api_error(
            status.HTTP_403_FORBIDDEN,
            "forbidden",
            "You can only change roles below your own.",
        )
    return role


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _get_role(db: AsyncSession, org_id: uuid.UUID, role_id: uuid.UUID) -> Role:
    """A role in this org. A role from another org is treated exactly like a missing one."""
    role = await db.scalar(select(Role).where(Role.id == role_id, Role.org_id == org_id))
    if role is None:
        raise api_error(status.HTTP_404_NOT_FOUND, "role_not_found", "That role doesn't exist.")
    return role


async def _ensure_name_free(
    db: AsyncSession,
    org_id: uuid.UUID,
    name: str,
    exclude_role_id: Optional[uuid.UUID] = None,
) -> None:
    """Role names are unique per org, ignoring case."""
    query = select(Role.id).where(Role.org_id == org_id, func.lower(Role.name) == name.lower())
    if exclude_role_id is not None:
        query = query.where(Role.id != exclude_role_id)
    if await db.scalar(query) is not None:
        raise api_error(
            status.HTTP_409_CONFLICT,
            "role_name_taken",
            f"A role called \"{name}\" already exists.",
        )


async def _parent_map(db: AsyncSession, org_id: uuid.UUID) -> dict[uuid.UUID, Optional[uuid.UUID]]:
    rows = await db.execute(select(Role.id, Role.parent_role_id).where(Role.org_id == org_id))
    return {row.id: row.parent_role_id for row in rows}


def _ancestors(
    role_id: uuid.UUID,
    parent_of: Mapping[uuid.UUID, Optional[uuid.UUID]],
) -> set[uuid.UUID]:
    """Every role above this one, up to the root. Cycle-safe."""
    above: set[uuid.UUID] = set()
    node = parent_of.get(role_id)
    while node is not None and node not in above:
        above.add(node)
        node = parent_of.get(node)
    return above


def _depths(parent_of: Mapping[uuid.UUID, Optional[uuid.UUID]]) -> dict[uuid.UUID, int]:
    """Steps from each role up to its root (Admin = 0). Cycle-safe."""
    depth: dict[uuid.UUID, int] = {}
    for start in parent_of:
        path: list[uuid.UUID] = []
        node: Optional[uuid.UUID] = start
        while node is not None and node not in depth and node not in path:
            path.append(node)
            node = parent_of.get(node)
        base = depth.get(node, -1) if node is not None else -1
        for offset, role_id in enumerate(reversed(path), start=1):
            depth[role_id] = base + offset
    return depth


def _to_response(role: Role, depth: int, manageable: bool) -> RoleResponse:
    return RoleResponse(
        id=role.id,
        name=role.name,
        description=role.description,
        parent_role_id=role.parent_role_id,
        depth=depth,
        permissions=list(role.permissions or []),
        is_system=role.is_system,
        manageable=manageable,
        created_at=role.created_at,
    )
