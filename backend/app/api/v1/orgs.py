"""
app/api/v1/orgs.py — Set up a new workspace (Ticket 12 D10, Ticket 05 §7)

Identity-only: the org isn't in Trellis yet, so this route stops at
get_current_user instead of get_org_context.
"""
from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import ClerkClaims
from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.errors import error_responses
from app.models.user import User
from app.schemas.auth import OrgSummary
from app.schemas.orgs import ProvisionOrgResponse
from app.services.orgs import provision_org

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
