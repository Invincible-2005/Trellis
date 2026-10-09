"""
app/services/tasks.py — Who can see which tasks and team numbers (Ticket 03 §1a, 12 D13/D24)

Shared by the future REST routes (task list, dashboard) and the chat agent's
get_tasks / get_team_summary tools, so chat and pages always agree.

A user sees the tasks of every team they can view: teams they are on, plus
teams where every member ranks below them (viewable_team_ids, D13). A team they
can't view behaves exactly like a missing one.

Team summary (D24): task counts for every viewable team; the active strike
count only where the user can give or review strikes in that team.
"""
import uuid
from datetime import datetime, timezone

from fastapi import status
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import api_error
from app.models.strike import Strike
from app.models.task import Task
from app.models.team import Team, TeamMember
from app.models.user import User
from app.schemas.tasks import TaskFilters, TaskResult, TaskSummary, TeamOverview
from app.scope.resolver import AccessScope


def _now() -> datetime:
    """Deadlines are stored as naive UTC (datetime.utcnow), so compare with naive UTC."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _overdue(now: datetime):
    """SQL condition: the deadline has passed and the task isn't done."""
    return and_(Task.deadline.is_not(None), Task.deadline < now, Task.status != "done")


async def list_tasks(db: AsyncSession, scope: AccessScope, filters: TaskFilters) -> list[TaskResult]:
    """
    Tasks the user may see, soonest deadline first (tasks without one last).

    Raises:
        404 team_not_found — filters.team_id is missing, in another org, or not viewable
    """
    if filters.team_id is not None and not scope.can_view_team(filters.team_id):
        raise api_error(status.HTTP_404_NOT_FOUND, "team_not_found", "Team not found.")
    team_ids = [filters.team_id] if filters.team_id is not None else list(scope.viewable_team_ids)

    now = _now()
    stmt = (
        select(Task, Team.name.label("team_name"), User.name.label("assignee_name"))
        .join(Team, Team.id == Task.team_id)
        .outerjoin(User, User.id == Task.assigned_to_user_id)
        .where(Team.org_id == scope.org_id, Task.team_id.in_(team_ids))
    )
    if filters.assigned_to_me:
        stmt = stmt.where(Task.assigned_to_user_id == scope.user_id)
    if filters.status is not None:
        stmt = stmt.where(Task.status == filters.status)
    if filters.overdue_only:
        stmt = stmt.where(_overdue(now))
    stmt = stmt.order_by(Task.deadline.asc().nulls_last(), Task.created_at.desc()).limit(filters.limit)

    return [
        TaskResult(
            id=task.id,
            team_id=task.team_id,
            team_name=team_name,
            title=task.title,
            description=task.description,
            assigned_to_user_id=task.assigned_to_user_id,
            assigned_to_name=assignee_name,
            deadline=task.deadline,
            status=task.status,
            overdue=task.deadline is not None and task.deadline < now and task.status != "done",
        )
        for task, team_name, assignee_name in (await db.execute(stmt)).all()
    ]


async def team_summary(db: AsyncSession, scope: AccessScope) -> list[TeamOverview]:
    """One overview per team the user can view, sorted by team name."""
    team_ids = list(scope.viewable_team_ids)
    if not team_ids:
        return []

    teams = (
        await db.execute(
            select(Team.id, Team.name)
            .where(Team.org_id == scope.org_id, Team.id.in_(team_ids))
            .order_by(Team.name)
        )
    ).all()

    member_counts: dict[uuid.UUID, int] = dict(
        (
            await db.execute(
                select(TeamMember.team_id, func.count(func.distinct(TeamMember.user_id)))
                .where(TeamMember.team_id.in_(team_ids))
                .group_by(TeamMember.team_id)
            )
        ).all()
    )

    summaries: dict[uuid.UUID, TaskSummary] = {team_id: TaskSummary() for team_id, _ in teams}
    status_counts = await db.execute(
        select(Task.team_id, Task.status, func.count())
        .where(Task.team_id.in_(team_ids))
        .group_by(Task.team_id, Task.status)
    )
    for team_id, task_status, count in status_counts.all():
        if team_id in summaries:
            setattr(summaries[team_id], task_status, count)
    overdue_counts = await db.execute(
        select(Task.team_id, func.count())
        .where(Task.team_id.in_(team_ids), _overdue(_now()))
        .group_by(Task.team_id)
    )
    for team_id, count in overdue_counts.all():
        if team_id in summaries:
            summaries[team_id].overdue = count

    # D24: strike counts only for teams where the user handles strikes
    strike_team_ids = [
        team_id for team_id in team_ids
        if scope.can("give_strike", team_id) or scope.can("review_strike", team_id)
    ]
    strike_counts: dict[uuid.UUID, int] = {}
    if strike_team_ids:
        strike_counts = dict(
            (
                await db.execute(
                    select(Strike.team_id, func.count())
                    .where(Strike.team_id.in_(strike_team_ids), Strike.status != "dismissed")
                    .group_by(Strike.team_id)
                )
            ).all()
        )

    return [
        TeamOverview(
            team_id=team_id,
            team_name=team_name,
            member_count=member_counts.get(team_id, 0),
            task_summary=summaries[team_id],
            active_strikes=strike_counts.get(team_id, 0) if team_id in strike_team_ids else None,
        )
        for team_id, team_name in teams
    ]
