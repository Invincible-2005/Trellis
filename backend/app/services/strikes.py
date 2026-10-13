"""
app/services/strikes.py — Giving a strike (Ticket 12 D6, D30, D46)

Who may give one: someone with give_strike in that team (org role or team role,
can()) to a team member ranked below them there (can_give_in_team, the D30
yardstick). Nobody can strike themselves.

Used by the chat agent's give_strike action: check_give_strike() before the
Confirm card, give_strike() after the click (D22/D45). The policy check (D46)
runs in the agent (app/agent/actions.py) and only produces a warning; its
result is passed in here to be kept on the strike for appeal reviewers.

Counting (D6): confirmed and appealed strikes are active; dismissed ones aren't.
The 3rd active strike for a person in a team is saved with escalated = True.
"""
import logging
import uuid

from fastapi import status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.core.errors import api_error
from app.models.strike import Strike
from app.models.team import Team, TeamMember
from app.models.user import User
from app.schemas.strikes import CreateStrikeRequest, StrikeResponse
from app.scope.resolver import AccessScope

logger = logging.getLogger(__name__)

ACTIVE_STATUSES = ("confirmed", "appealed")
ESCALATION_THRESHOLD = 3


async def check_give_strike(
    db: AsyncSession, scope: AccessScope, body: CreateStrikeRequest
) -> tuple[str, str, int]:
    """
    Every rule give_strike checks, without saving.

    Returns (team name, receiver name, their active strikes in this team so far).

    Raises:
        404 team_not_found   — missing, in another org, or not viewable
        403 forbidden        — no give_strike in this team, striking yourself, or
                               the person isn't ranked below you in this team
        404 member_not_found — the person isn't on this team
    """
    team_name = await db.scalar(
        select(Team.name).where(Team.id == body.team_id, Team.org_id == scope.org_id)
    )
    if team_name is None or not scope.can_view_team(body.team_id):
        raise api_error(status.HTTP_404_NOT_FOUND, "team_not_found", "Team not found.")
    if not scope.can("give_strike", body.team_id):
        raise api_error(status.HTTP_403_FORBIDDEN, "forbidden", "You can't give strikes in this team.")
    # Checked by user, not role: your own team role can sit below your org role
    if body.given_to_user_id == scope.user_id:
        raise api_error(status.HTTP_403_FORBIDDEN, "forbidden", "You can't give a strike to yourself.")

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
            "You can only give strikes to people ranked below you on this team.",
        )

    active = await db.scalar(
        select(func.count()).select_from(Strike).where(
            Strike.team_id == body.team_id,
            Strike.given_to_user_id == body.given_to_user_id,
            Strike.status.in_(ACTIVE_STATUSES),
        )
    )
    return team_name, row.name, active or 0


async def give_strike(
    db: AsyncSession,
    scope: AccessScope,
    body: CreateStrikeRequest,
    policy_chunk_ids: list[str],
    agent_evaluation: str,
) -> StrikeResponse:
    """
    Save a confirmed strike (D6), with the policy check shown on the card (D46).
    The chat agent calls this after the user's Confirm click, with the scope of
    that click's request, so the rules are checked again at that moment.

    Raises: see check_give_strike.
    """
    team_name, receiver_name, active = await check_give_strike(db, scope, body)
    strike = Strike(
        id=uuid.uuid4(),
        org_id=scope.org_id,
        team_id=body.team_id,
        given_by_user_id=scope.user_id,
        given_to_user_id=body.given_to_user_id,
        reason=body.reason,
        policy_chunk_ids=policy_chunk_ids,
        agent_evaluation=agent_evaluation,
        status="confirmed",
        escalated=active + 1 >= ESCALATION_THRESHOLD,
    )
    db.add(strike)
    await db.commit()
    await db.refresh(strike)
    giver_name = await db.scalar(select(User.name).where(User.id == scope.user_id))
    logger.info(
        "User %s gave a strike to %s in team %s (escalated=%s)",
        scope.user_id, body.given_to_user_id, body.team_id, strike.escalated,
    )
    return StrikeResponse(
        id=strike.id,
        team_id=body.team_id,
        team_name=team_name,
        given_by_user_id=scope.user_id,
        given_by_name=giver_name or "",
        given_to_user_id=body.given_to_user_id,
        given_to_name=receiver_name,
        reason=strike.reason,
        status=strike.status,
        escalated=strike.escalated,
        created_at=strike.created_at,
    )


async def list_my_strikes(db: AsyncSession, scope: AccessScope) -> list[StrikeResponse]:
    """Strikes given to the user in this org, newest first; dismissed ones left out (D6, D47)."""
    Giver = aliased(User)
    Receiver = aliased(User)
    rows = await db.execute(
        select(
            Strike,
            Team.name.label("team_name"),
            Giver.name.label("giver_name"),
            Receiver.name.label("receiver_name"),
        )
        .join(Team, Team.id == Strike.team_id)
        .join(Giver, Giver.id == Strike.given_by_user_id)
        .join(Receiver, Receiver.id == Strike.given_to_user_id)
        .where(
            Strike.org_id == scope.org_id,
            Strike.given_to_user_id == scope.user_id,
            Strike.status != "dismissed",
        )
        .order_by(Strike.created_at.desc())
    )
    return [
        StrikeResponse(
            id=row.Strike.id,
            team_id=row.Strike.team_id,
            team_name=row.team_name,
            given_by_user_id=row.Strike.given_by_user_id,
            given_by_name=row.giver_name or "",
            given_to_user_id=row.Strike.given_to_user_id,
            given_to_name=row.receiver_name or "",
            reason=row.Strike.reason,
            status=row.Strike.status,
            escalated=row.Strike.escalated,
            created_at=row.Strike.created_at,
        )
        for row in rows.all()
    ]
