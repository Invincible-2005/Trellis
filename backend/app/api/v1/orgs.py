"""
app/api/v1/orgs.py — Set up a new workspace (Ticket 12 D10, Ticket 05 §7) and
the active org's profile for the /organization page (Ticket 12 D34/D35)

/provision is identity-only: the org isn't in Trellis yet, so it stops at
get_current_user. The /current routes need a set-up org, so each depends on
get_org_context (not the whole router, because of /provision).
"""
from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import ClerkClaims
from app.core.database import get_db
from app.core.deps import get_current_user, get_org_context, get_scope
from app.core.errors import error_responses
from app.models.user import User
from app.schemas.auth import OrgSummary
from app.schemas.orgs import OrgProfileResponse, ProvisionOrgResponse, UpdateOrgDescriptionRequest
from app.scope.resolver import AccessScope
from app.services.orgs import get_org_profile, provision_org, update_org_description

router = APIRouter(prefix="/orgs", tags=["orgs"])


@router.post(
    "/provision",
    response_model=ProvisionOrgResponse,
    responses={
        201: {"model": ProvisionOrgResponse, "description": "Workspace set up just now"},
        **error_responses(400, 401, 403, 409, 503),
    },
)
async def provision(
    response: Response,
    ctx: tuple[User, ClerkClaims] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProvisionOrgResponse:
    """
    Set up the active Clerk org in Trellis: the org, its root `Admin` role and the
    creator as Admin. Called by the /onboarding page. Returns 201 the first time,
    200 if the org was already set up.
    """
    user, claims = ctx
    result = await provision_org(db, user, claims)
    response.status_code = status.HTTP_201_CREATED if result.created else status.HTTP_200_OK
    return ProvisionOrgResponse(
        org=OrgSummary.model_validate(result.org),
        admin_role_id=result.admin_role_id,
        created=result.created,
    )


@router.get(
    "/current",
    response_model=OrgProfileResponse,
    dependencies=[Depends(get_org_context)],
    responses=error_responses(400, 401, 409, 503),
)
async def get_current_org(
    scope: AccessScope = Depends(get_scope),
    db: AsyncSession = Depends(get_db),
) -> OrgProfileResponse:
    """The active org's name and description. `can_edit_description` = caller holds the root Admin role (D35)."""
    return await get_org_profile(db, scope)


@router.patch(
    "/current",
    response_model=OrgProfileResponse,
    dependencies=[Depends(get_org_context)],
    responses=error_responses(400, 401, 403, 409, 503),
)
async def update_current_org(
    body: UpdateOrgDescriptionRequest,
    scope: AccessScope = Depends(get_scope),
    db: AsyncSession = Depends(get_db),
) -> OrgProfileResponse:
    """Save the org description (up to 1,000 characters; empty clears it). Root Admin role only (D35)."""
    return await update_org_description(db, scope, body)
