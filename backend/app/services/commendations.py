"""
app/services/commendations.py — Giving a commendation (Ticket 12 D5)

Who may give one: someone ranked above the person in that team, i.e. the
receiver's role in that team is strictly below the giver's org role or the
giver's role in that team (can_give_in_team, the D30 yardstick). No permission
is needed; peers can't commend each other, and nobody can commend themselves.

Used by the chat agent's give_commendation action: check_give_commendation()
before the Confirm card, give_commendation() after the click (D22/D45).
"""
import logging
import uuid

from fastapi import status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import api_error
from app.models.commendation import Commendation
from app.models.team import Team, TeamMember
from app.models.user import User
from app.schemas.commendations import CommendationResponse, CreateCommendationRequest
from app.scope.resolver import AccessScope

logger = logging.getLogger(__name__)


async def check_give_commendation(
    db: AsyncSession, scope: AccessScope, body: CreateCommendationRequest
) -> tuple[str, str]:
    """
    Every rule give_commendation checks, without saving.

    Returns (team name, receiver name) for the Confirm card.

    Raises:
        404 team_not_found   — missing, in another org, or not viewable
        403 forbidden        — commending yourself, or the person isn't ranked below you in this team
        404 member_not_found — the person isn't on this team
    """
    team_name = await db.scalar(
        select(Team.name).where(Team.id == body.team_id, Team.org_id == scope.org_id)
    )
    if team_name is None or not scope.can_view_team(body.team_id):
        raise api_error(status.HTTP_404_NOT_FOUND, "team_not_found", "Team not found.")
    # Checked by user, not role: your own team role can sit below your org role
    if body.given_to_user_id == scope.user_id:
        raise api_error(status.HTTP_403_FORBIDDEN, "forbidden", "You can't commend yourself.")

    row = (
        await db.execute(
            select(TeamMember.role_id, User.name)
            .join(User, User.id == TeamMember.user_id)
            .where(TeamMember.team_id == body.team_id, TeamMember.user_id == body.given_to_user_id)
        )
    ).first()
    if row is None:
        raise api_error(status.HTTP_404_NOT_FOUND, "member_not_found", "That person isn't on this team.")
    if not scope.can_give_in_team(row.role_id, body.team_id):
        raise api_error(
            status.HTTP_403_FORBIDDEN,
            "forbidden",
            "You can only commend people ranked below you on this team.",
        )
    return team_name, row.name


async def give_commendation(
    db: AsyncSession, scope: AccessScope, body: CreateCommendationRequest
) -> CommendationResponse:
    """
    Save a commendation. The chat agent calls this after the user's Confirm
    click, with the scope of that click's request, so the rules are checked
    again at that moment.

    Raises: see check_give_commendation.
    """
    team_name, receiver_name = await check_give_commendation(db, scope, body)
    commendation = Commendation(
        id=uuid.uuid4(),
        org_id=scope.org_id,
        team_id=body.team_id,
        given_by_user_id=scope.user_id,
        given_to_user_id=body.given_to_user_id,
        reason=body.reason,
    )
    db.add(commendation)
    await db.commit()
    await db.refresh(commendation)
    giver_name = await db.scalar(select(User.name).where(User.id == scope.user_id))
    logger.info(
        "User %s commended %s in team %s", scope.user_id, body.given_to_user_id, body.team_id
    )
    return CommendationResponse(
        id=commendation.id,
        team_id=body.team_id,
        team_name=team_name,
        given_by_user_id=scope.user_id,
        given_by_name=giver_name or "",
        given_to_user_id=body.given_to_user_id,
        given_to_name=receiver_name,
        reason=commendation.reason,
        created_at=commendation.created_at,
    )
