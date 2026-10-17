"""
app/services/feedback.py — What the /feedback page offers a user (Ticket 12 D54)

The page (and the sidebar's Feedback link, via /auth/context) shows a tab only
when the user can use it:
- give_strike: give_strike in a team (org role or team role, can()) where a
  member ranks below them (can_give_in_team, the D30 yardstick);
- give_commendation: a member of a team they can see ranks below them (D5: rank
  only, no permission);
- review_appeals: review_strike org-wide or on any team (D6).

Same rules as check_give_strike / check_give_commendation, which still check
every save.
"""
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.role import Role
from app.models.team import Team, TeamMember
from app.models.user import User
from app.schemas.feedback import FeedbackOptionsResponse, FeedbackPerson, FeedbackTeamOption
from app.scope.resolver import AccessScope


def _can_review_somewhere(scope: AccessScope) -> bool:
    return scope.can_org("review_strike") or any(
        "review_strike" in perms for perms in scope.permissions_by_team.values()
    )


async def feedback_options(db: AsyncSession, scope: AccessScope) -> FeedbackOptionsResponse:
    """The tabs this user gets, and per team who they may strike or commend."""
    teams: dict[uuid.UUID, FeedbackTeamOption] = {}
    if scope.viewable_team_ids:
        rows = await db.execute(
            select(
                Team.id.label("team_id"),
                Team.name.label("team_name"),
                TeamMember.user_id,
                TeamMember.role_id,
                User.name,
                User.email,
                Role.name.label("role_name"),
            )
            .join(TeamMember, TeamMember.team_id == Team.id)
            .join(User, User.id == TeamMember.user_id)
            .join(Role, Role.id == TeamMember.role_id)
            .where(
                Team.org_id == scope.org_id,
                Team.id.in_(scope.viewable_team_ids),
                TeamMember.user_id != scope.user_id,   # never yourself
            )
            .order_by(Team.name, User.name)
        )
        for row in rows.all():
            if not scope.can_give_in_team(row.role_id, row.team_id):
                continue
            option = teams.setdefault(
                row.team_id, FeedbackTeamOption(team_id=row.team_id, team_name=row.team_name)
            )
            person = FeedbackPerson(
                user_id=row.user_id, name=row.name, email=row.email, team_role_name=row.role_name
            )
            option.commend_people.append(person)
            if scope.can("give_strike", row.team_id):
                option.strike_people.append(person)

    options = list(teams.values())
    tabs = []
    if any(o.strike_people for o in options):
        tabs.append("give_strike")
    if options:
        tabs.append("give_commendation")
    if _can_review_somewhere(scope):
        tabs.append("review_appeals")
    return FeedbackOptionsResponse(tabs=tabs, teams=options)


async def feedback_tabs(db: AsyncSession, scope: AccessScope) -> list[str]:
    """For /auth/context: the sidebar shows Feedback when this isn't empty."""
    return (await feedback_options(db, scope)).tabs
