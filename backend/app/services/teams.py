"""
app/services/teams.py — Team pages (Ticket 12 D13, D28–D31)

/teams lists every team the user can view: teams they are on, plus teams they
oversee (every member ranks below them, or an empty team they could staff).
A team they can't view behaves exactly like a missing one (404).

Task numbers come from services/tasks.py::team_summary, so the team cards and
the chat assistant's team summary always agree.

Team actions use the team yardstick (D30): a role can be given or taken away in
a team if it is strictly below the user's org role or their role in that team,
and carries only permissions the user has there.

Every change calls invalidate_org: one new member can change which teams other
people oversee (D13), and a new empty team appears for everyone who can staff it (D29).
"""
import logging
import uuid
from datetime import datetime

from fastapi import status
from sqlalchemy import delete, exists, func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import api_error
from app.models.document import Document
from app.models.invitation import Invitation
from app.models.organization import OrgMember
from app.models.role import Role
from app.models.strike import Strike
from app.models.task import Task
from app.models.team import Team, TeamMember
from app.models.user import User
from app.schemas.tasks import TeamOverview
from app.schemas.teams import (
    AddTeamMemberRequest,
    CandidateMember,
    CreateTeamRequest,
    RoleOption,
    TeamCandidatesResponse,
    TeamDetailResponse,
    TeamListResponse,
    TeamMemberResponse,
    TeamResponse,
)
from app.scope.resolver import AccessScope, invalidate_org
from app.services.tasks import team_summary

logger = logging.getLogger(__name__)


async def list_teams(db: AsyncSession, scope: AccessScope) -> TeamListResponse:
    """Every team the user can view, sorted by name, with the flags for its buttons."""
    overviews = await team_summary(db, scope)
    my_roles = await _my_role_names(db, scope)
    return TeamListResponse(
        can_create_team=scope.can_org("create_team"),
        teams=[_team_response(scope, overview, my_roles) for overview in overviews],
    )


async def get_team(db: AsyncSession, scope: AccessScope, team_id: uuid.UUID) -> TeamDetailResponse:
    """
    One team's card data plus its members.

    Raises:
        404 team_not_found — missing, in another org, or not viewable
    """
    overview = await _get_overview(db, scope, team_id)
    my_roles = await _my_role_names(db, scope)

    rows = (
        await db.execute(
            select(TeamMember, User, Role.name)
            .join(User, User.id == TeamMember.user_id)
            .join(Role, Role.id == TeamMember.role_id)
            .where(TeamMember.team_id == team_id)
            .order_by(User.name)
        )
    ).all()
    can_add = scope.can("add_member", team_id)
    can_assign = scope.can("assign_task", team_id)
    members = [
        TeamMemberResponse(
            user_id=user.id,
            name=user.name,
            email=user.email,
            role_id=member.role_id,
            role_name=role_name,
            joined_at=member.joined_at,
            removable=can_add and scope.can_give_in_team(member.role_id, team_id),
            assignable=can_assign and scope.can_give_in_team(member.role_id, team_id),
        )
        for member, user, role_name in rows
    ]
    card = _team_response(scope, overview, my_roles)
    return TeamDetailResponse(**card.model_dump(), members=members)


async def list_candidates(
    db: AsyncSession, scope: AccessScope, team_id: uuid.UUID
) -> TeamCandidatesResponse:
    """
    Choices for the Add member dialog: org members not on the team yet, and the
    team roles the user may give here (D25, D30).

    Raises:
        404 team_not_found — missing, in another org, or not viewable
        403 forbidden      — the user can't add members to this team
    """
    await _get_overview(db, scope, team_id)
    _require_team_admin(scope, team_id)

    on_team = select(TeamMember.user_id).where(TeamMember.team_id == team_id)
    users = (
        await db.scalars(
            select(User)
            .join(OrgMember, OrgMember.user_id == User.id)
            .where(OrgMember.org_id == scope.org_id, User.id.not_in(on_team))
            .order_by(User.name)
        )
    ).all()

    allowed = scope.permissions_in_team(team_id)
    roles = (
        await db.scalars(select(Role).where(Role.org_id == scope.org_id).order_by(Role.name))
    ).all()
    return TeamCandidatesResponse(
        members=[CandidateMember(user_id=u.id, name=u.name, email=u.email) for u in users],
        roles=[
            RoleOption(id=role.id, name=role.name)
            for role in roles
            if scope.can_give_in_team(role.id, team_id) and set(role.permissions or []) <= allowed
        ],
    )


async def create_team(db: AsyncSession, scope: AccessScope, body: CreateTeamRequest) -> TeamResponse:
    """
    Create an empty team. The creator does not join it (D29).

    Raises:
        403 forbidden       — no org-level create_team
        409 team_name_taken — another team in the org has this name (any letter case)
    """
    if not scope.can_org("create_team"):
        raise api_error(status.HTTP_403_FORBIDDEN, "forbidden", "You can't create teams.")
    taken = await db.scalar(
        select(exists().where(Team.org_id == scope.org_id, func.lower(Team.name) == body.name.lower()))
    )
    if taken:
        raise api_error(
            status.HTTP_409_CONFLICT, "team_name_taken", f"A team called {body.name} already exists."
        )

    team = Team(id=uuid.uuid4(), org_id=scope.org_id, name=body.name, created_by_user_id=scope.user_id)
    db.add(team)
    await db.commit()
    invalidate_org(scope.org_id)
    logger.info("User %s created team %s in org %s", scope.user_id, team.id, scope.org_id)

    # The cached scope predates the team; org-level permissions decide its buttons.
    return TeamResponse(
        id=team.id,
        name=team.name,
        member_count=0,
        open_tasks=0,
        overdue_tasks=0,
        can_add_member=scope.can_org("add_member"),
        can_assign_task=scope.can_org("assign_task"),
        deletable=True,
    )


async def delete_team(db: AsyncSession, scope: AccessScope, team_id: uuid.UUID) -> None:
    """
    Delete a team that has no work left in it (D31). Its member rows go with it;
    pending invites that named it become plain org invites (the person still joins
    the org, without a role), so no Clerk call is needed.

    Raises:
        404 team_not_found — missing, in another org, or not viewable
        403 forbidden      — no org-level create_team, or a team the user doesn't oversee
        409 team_not_empty — it still has tasks, strikes or team documents
    """
    await _get_visible_team(db, scope, team_id)
    if not (scope.can_org("create_team") and team_id in scope.governed_team_ids):
        raise api_error(status.HTTP_403_FORBIDDEN, "forbidden", "You can't delete this team.")

    leftovers = [
        label
        for label, model in (("tasks", Task), ("strikes", Strike), ("documents", Document))
        if await db.scalar(select(exists().where(model.team_id == team_id)))
    ]
    if leftovers:
        raise api_error(
            status.HTTP_409_CONFLICT,
            "team_not_empty",
            f"This team still has {', '.join(leftovers)}. Remove them first.",
        )

    await db.execute(
        update(Invitation).where(Invitation.team_id == team_id).values(team_id=None, role_id=None)
    )
    await db.execute(delete(TeamMember).where(TeamMember.team_id == team_id))
    await db.execute(delete(Team).where(Team.id == team_id))
    await db.commit()
    invalidate_org(scope.org_id)
    logger.info("User %s deleted team %s in org %s", scope.user_id, team_id, scope.org_id)


async def add_team_member(
    db: AsyncSession, scope: AccessScope, team_id: uuid.UUID, body: AddTeamMemberRequest
) -> TeamMemberResponse:
    """
    Put an existing org member into the team with a team role (D25, D30).

    Raises:
        404 team_not_found / member_not_found / role_not_found
        403 forbidden       — can't add members here, or the role isn't one the user may give
        409 already_in_team
    """
    await _get_visible_team(db, scope, team_id)
    _require_team_admin(scope, team_id)

    user = await db.scalar(
        select(User)
        .join(OrgMember, OrgMember.user_id == User.id)
        .where(OrgMember.org_id == scope.org_id, User.id == body.user_id)
    )
    if user is None:
        raise api_error(
            status.HTTP_404_NOT_FOUND, "member_not_found", "That person isn't in this organization."
        )
    role = await _get_givable_role(db, scope, team_id, body.role_id)

    member = TeamMember(
        id=uuid.uuid4(), team_id=team_id, user_id=user.id, role_id=role.id, joined_at=datetime.utcnow()
    )
    name = user.name  # read now: a rollback expires loaded rows
    db.add(member)
    try:
        await db.commit()
    except IntegrityError:  # UNIQUE (team_id, user_id)
        await db.rollback()
        raise api_error(
            status.HTTP_409_CONFLICT, "already_in_team", f"{name} is already on this team."
        )
    invalidate_org(scope.org_id)
    logger.info("User %s added user %s to team %s", scope.user_id, user.id, team_id)

    return TeamMemberResponse(
        user_id=user.id,
        name=user.name,
        email=user.email,
        role_id=role.id,
        role_name=role.name,
        joined_at=member.joined_at,
        removable=True,
        assignable=scope.can("assign_task", team_id),
    )


async def remove_team_member(
    db: AsyncSession, scope: AccessScope, team_id: uuid.UUID, user_id: uuid.UUID
) -> None:
    """
    Take someone off the team. Only people whose team role the user could give (D30),
    so nobody removes themselves, a peer or someone above them.

    Raises:
        404 team_not_found / member_not_found
        403 forbidden — can't manage members here, or their role isn't below the user's
    """
    await _get_visible_team(db, scope, team_id)
    _require_team_admin(scope, team_id)

    member = await db.scalar(
        select(TeamMember).where(TeamMember.team_id == team_id, TeamMember.user_id == user_id)
    )
    if member is None:
        raise api_error(status.HTTP_404_NOT_FOUND, "member_not_found", "That person isn't on this team.")
    if not scope.can_give_in_team(member.role_id, team_id):
        raise api_error(
            status.HTTP_403_FORBIDDEN,
            "forbidden",
            "You can only remove people whose team role is below yours.",
        )

    await db.delete(member)
    await db.commit()
    invalidate_org(scope.org_id)
    logger.info("User %s removed user %s from team %s", scope.user_id, user_id, team_id)


# ── helpers ───────────────────────────────────────────────────────────────────

async def _get_visible_team(db: AsyncSession, scope: AccessScope, team_id: uuid.UUID) -> Team:
    """The team, or 404 if it isn't in this org or the user can't view it."""
    team = await db.scalar(select(Team).where(Team.id == team_id, Team.org_id == scope.org_id))
    if team is None or not scope.can_view_team(team_id):
        raise api_error(status.HTTP_404_NOT_FOUND, "team_not_found", "Team not found.")
    return team


def _require_team_admin(scope: AccessScope, team_id: uuid.UUID) -> None:
    if not scope.can("add_member", team_id):
        raise api_error(
            status.HTTP_403_FORBIDDEN, "forbidden", "You can't manage members of this team."
        )


async def _get_givable_role(
    db: AsyncSession, scope: AccessScope, team_id: uuid.UUID, role_id: uuid.UUID
) -> Role:
    """A role in this org that the user may give in this team (D30)."""
    role = await db.scalar(select(Role).where(Role.id == role_id, Role.org_id == scope.org_id))
    if role is None:
        raise api_error(status.HTTP_404_NOT_FOUND, "role_not_found", "That role doesn't exist.")
    if not scope.can_give_in_team(role.id, team_id):
        raise api_error(
            status.HTTP_403_FORBIDDEN, "forbidden", "You can only give roles below your own."
        )
    lacking = sorted(set(role.permissions or []) - scope.permissions_in_team(team_id))
    if lacking:
        raise api_error(
            status.HTTP_403_FORBIDDEN,
            "forbidden",
            f"You can't give the {role.name} role: it has permissions you don't have ({', '.join(lacking)}).",
        )
    return role


async def _get_overview(db: AsyncSession, scope: AccessScope, team_id: uuid.UUID) -> TeamOverview:
    """The team's overview, or 404 if it doesn't exist here or the user can't view it."""
    overviews = await team_summary(db, scope, only_team_ids=[team_id])
    if not overviews:
        raise api_error(status.HTTP_404_NOT_FOUND, "team_not_found", "Team not found.")
    return overviews[0]


async def _my_role_names(db: AsyncSession, scope: AccessScope) -> dict[uuid.UUID, str]:
    """team_id → the name of the user's role in that team (only teams they are on)."""
    if not scope.member_team_ids:
        return {}
    rows = await db.execute(
        select(TeamMember.team_id, Role.name)
        .join(Role, Role.id == TeamMember.role_id)
        .where(TeamMember.user_id == scope.user_id, TeamMember.team_id.in_(list(scope.member_team_ids)))
    )
    return dict(rows.all())


def _team_response(
    scope: AccessScope, overview: TeamOverview, my_roles: dict[uuid.UUID, str]
) -> TeamResponse:
    team_id = overview.team_id
    tasks = overview.task_summary
    return TeamResponse(
        id=team_id,
        name=overview.team_name,
        my_role_name=my_roles.get(team_id),
        member_count=overview.member_count,
        open_tasks=tasks.todo + tasks.in_progress + tasks.blocked,
        overdue_tasks=tasks.overdue,
        can_add_member=scope.can("add_member", team_id),
        can_assign_task=scope.can("assign_task", team_id),
        # D31: org-level create_team, on a team the user oversees (not merely one they're on)
        deletable=scope.can_org("create_team") and team_id in scope.governed_team_ids,
    )
