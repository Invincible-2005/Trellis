"""
app/api/v1/admin.py — Admin console routes (Ticket 05 §2/§7, Ticket 12 D4/D17/D25/D26)

The router requires an org (get_org_context); every route also depends on get_scope.
The checks themselves live in app/services.
"""
import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_org_context, get_scope
from app.core.errors import error_responses
from app.schemas.admin import (
    AddMemberRequest,
    AddMemberResponse,
    CreateRoleRequest,
    MemberListResponse,
    MemberResponse,
    RoleListResponse,
    RoleResponse,
    UpdateMemberRequest,
    UpdateRoleRequest,
)
from app.scope.resolver import AccessScope
from app.services import members, roles

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(get_org_context)])


@router.get(
    "/roles",
    response_model=RoleListResponse,
    responses=error_responses(400, 401, 403, 409, 503),
)
async def list_roles(
    scope: AccessScope = Depends(get_scope),
    db: AsyncSession = Depends(get_db),
) -> RoleListResponse:
    """
    Every role in the org as a flat list with `depth`. `manageable` marks the roles
    the caller may edit or delete (strictly below their org-level role).
    """
    return RoleListResponse(roles=await roles.list_roles(db, scope))


@router.post(
    "/roles",
    response_model=RoleResponse,
    status_code=status.HTTP_201_CREATED,
    responses=error_responses(400, 401, 403, 404, 409, 503),
)
async def create_role(
    body: CreateRoleRequest,
    scope: AccessScope = Depends(get_scope),
    db: AsyncSession = Depends(get_db),
) -> RoleResponse:
    """
    Create a role under the caller's org-level role or a role below it, holding
    only permissions the caller has (D17).
    """
    return await roles.create_role(db, scope, body)


@router.patch(
    "/roles/{role_id}",
    response_model=RoleResponse,
    responses=error_responses(400, 401, 403, 404, 409, 503),
)
async def update_role(
    role_id: uuid.UUID,
    body: UpdateRoleRequest,
    scope: AccessScope = Depends(get_scope),
    db: AsyncSession = Depends(get_db),
) -> RoleResponse:
    """
    Rename, move or change the permissions of a role below the caller. Missing fields
    are left unchanged. The Admin role can't be changed (D17).
    """
    return await roles.update_role(db, scope, role_id, body)


@router.delete(
    "/roles/{role_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses=error_responses(400, 401, 403, 404, 409, 503),
)
async def delete_role(
    role_id: uuid.UUID,
    scope: AccessScope = Depends(get_scope),
    db: AsyncSession = Depends(get_db),
) -> None:
    """
    Delete a role below the caller. Refused (409) while roles sit under it or a
    member, invitation or document still uses it.
    """
    await roles.delete_role(db, scope, role_id)


@router.get(
    "/members",
    response_model=MemberListResponse,
    responses=error_responses(400, 401, 403, 409, 503),
)
async def list_members(
    scope: AccessScope = Depends(get_scope),
    db: AsyncSession = Depends(get_db),
) -> MemberListResponse:
    """Everyone in the org with their org-level role, plus pending invitations (D25)."""
    return await members.list_members(db, scope)


@router.post(
    "/members",
    response_model=AddMemberResponse,
    status_code=status.HTTP_201_CREATED,
    responses=error_responses(400, 401, 403, 404, 409, 503),
)
async def add_member(
    body: AddMemberRequest,
    scope: AccessScope = Depends(get_scope),
    db: AsyncSession = Depends(get_db),
) -> AddMemberResponse:
    """
    Add someone by email with an optional org-level role below your own (D26).
    `status` is "added" if they already use Trellis, "invited" if Clerk emailed them.
    """
    return await members.add_member(db, scope, body)


@router.patch(
    "/members/{user_id}",
    response_model=MemberResponse,
    responses=error_responses(400, 401, 403, 404, 409, 503),
)
async def update_member_role(
    user_id: uuid.UUID,
    body: UpdateMemberRequest,
    scope: AccessScope = Depends(get_scope),
    db: AsyncSession = Depends(get_db),
) -> MemberResponse:
    """
    Change someone's org-level role (`role_id: null` = no role). Only for people whose
    every role is below yours (D38), and only to a role you could invite them with.
    """
    return await members.update_member_role(db, scope, user_id, body)


@router.delete(
    "/members/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses=error_responses(400, 401, 403, 404, 409, 503),
)
async def remove_member(
    user_id: uuid.UUID,
    scope: AccessScope = Depends(get_scope),
    db: AsyncSession = Depends(get_db),
) -> None:
    """
    Remove someone from the org: out of the Clerk org, off every team, out of the
    org (D10-C, D38). Their tasks, strikes and documents stay.
    """
    await members.remove_member(db, scope, user_id)


@router.delete(
    "/invitations/{invitation_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses=error_responses(400, 401, 403, 404, 409, 503),
)
async def cancel_invitation(
    invitation_id: uuid.UUID,
    scope: AccessScope = Depends(get_scope),
    db: AsyncSession = Depends(get_db),
) -> None:
    """
    Cancel a pending invite: revoked in Clerk (the email link stops working), then
    removed. Only for invites with no role or a role below yours.
    """
    await members.cancel_invitation(db, scope, invitation_id)
