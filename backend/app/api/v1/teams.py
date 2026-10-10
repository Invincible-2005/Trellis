"""
app/api/v1/teams.py — Team routes for the /teams pages (Ticket 12 D28–D31)

The router requires an org (get_org_context); every route also depends on get_scope.
The checks themselves live in app/services/teams.py.
"""
import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_org_context, get_scope
from app.core.errors import error_responses
from app.schemas.teams import (
    AddTeamMemberRequest,
    CreateTeamRequest,
    TeamCandidatesResponse,
    TeamDetailResponse,
    TeamListResponse,
    TeamMemberResponse,
    TeamResponse,
)
from app.scope.resolver import AccessScope
from app.services import teams

router = APIRouter(prefix="/teams", tags=["teams"], dependencies=[Depends(get_org_context)])


@router.get(
    "",
    response_model=TeamListResponse,
    responses=error_responses(400, 401, 409, 503),
)
async def list_teams(
    scope: AccessScope = Depends(get_scope),
    db: AsyncSession = Depends(get_db),
) -> TeamListResponse:
    """Every team the caller is on or oversees (D13/D29), with card data and button flags."""
    return await teams.list_teams(db, scope)


@router.post(
    "",
    response_model=TeamResponse,
    status_code=status.HTTP_201_CREATED,
    responses=error_responses(400, 401, 403, 409, 503),
)
async def create_team(
    body: CreateTeamRequest,
    scope: AccessScope = Depends(get_scope),
    db: AsyncSession = Depends(get_db),
) -> TeamResponse:
    """Create an empty team (org-level create_team). The creator doesn't join it (D29)."""
    return await teams.create_team(db, scope, body)


@router.delete(
    "/{team_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses=error_responses(400, 401, 403, 404, 409, 503),
)
async def delete_team(
    team_id: uuid.UUID,
    scope: AccessScope = Depends(get_scope),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Delete a team you oversee (D31). 409 team_not_empty while it has tasks, strikes or documents."""
    await teams.delete_team(db, scope, team_id)


@router.post(
    "/{team_id}/members",
    response_model=TeamMemberResponse,
    status_code=status.HTTP_201_CREATED,
    responses=error_responses(400, 401, 403, 404, 409, 503),
)
async def add_team_member(
    team_id: uuid.UUID,
    body: AddTeamMemberRequest,
    scope: AccessScope = Depends(get_scope),
    db: AsyncSession = Depends(get_db),
) -> TeamMemberResponse:
    """Add an existing org member with a team role below yours (D25, D30)."""
    return await teams.add_team_member(db, scope, team_id, body)


@router.delete(
    "/{team_id}/members/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses=error_responses(400, 401, 403, 404, 409, 503),
)
async def remove_team_member(
    team_id: uuid.UUID,
    user_id: uuid.UUID,
    scope: AccessScope = Depends(get_scope),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Take someone off the team; only people whose team role is below yours (D30)."""
    await teams.remove_team_member(db, scope, team_id, user_id)


@router.get(
    "/{team_id}",
    response_model=TeamDetailResponse,
    responses=error_responses(400, 401, 404, 409, 503),
)
async def get_team(
    team_id: uuid.UUID,
    scope: AccessScope = Depends(get_scope),
    db: AsyncSession = Depends(get_db),
) -> TeamDetailResponse:
    """One team with its members. 404 team_not_found if the caller can't view it."""
    return await teams.get_team(db, scope, team_id)


@router.get(
    "/{team_id}/candidates",
    response_model=TeamCandidatesResponse,
    responses=error_responses(400, 401, 403, 404, 409, 503),
)
async def list_candidates(
    team_id: uuid.UUID,
    scope: AccessScope = Depends(get_scope),
    db: AsyncSession = Depends(get_db),
) -> TeamCandidatesResponse:
    """Add member dialog: org members not on the team, and the roles the caller may give here (D30)."""
    return await teams.list_candidates(db, scope, team_id)
