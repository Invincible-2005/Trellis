"""
app/api/v1/admin.py — Admin console routes (Ticket 05 §2/§7, Ticket 12 D4/D17)

Every route depends on get_scope; the checks themselves live in app/services.
"""
import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_scope
from app.core.errors import error_responses
from app.schemas.admin import (
    CreateRoleRequest,
    RoleListResponse,
    RoleResponse,
    UpdateRoleRequest,
)
from app.scope.resolver import AccessScope
from app.services import roles

router = APIRouter(prefix="/admin", tags=["admin"])


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
