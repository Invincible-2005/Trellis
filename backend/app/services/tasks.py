"""
app/services/tasks.py — Who can see which tasks and team numbers (Ticket 03 §1a, 12 D13/D24)

Shared by the future REST routes (task list, dashboard) and the chat agent's
get_tasks / get_team_summary tools, so chat and pages always agree.

A user sees the tasks of every team they can view: teams they are on, plus
teams where every member ranks below them (viewable_team_ids, D13). A team they
can't view behaves exactly like a missing one.

Team summary (D24): task counts for every viewable team; the active strike
count only where the user can give or review strikes in that team.

Creating and changing tasks (D32/D33): creating needs assign_task in the team, and
the assignee must be a team member ranked below the creator (can_give_in_team).
A task's managers are exactly the people who could have created it; they may
edit, reassign or delete it. The assignee may only change its status.

Hand-ins (D59): only the current assignee hands in work (a file + a note). Each
hand-in is seen by the person who handed it in and the task's managers, and only
its owner deletes it. Handing in never changes the status; nothing is embedded.

Comments (D60): anyone who can see the task reads and posts; only the author
edits or deletes their own. Plain text, oldest first.
"""
import logging
import uuid
from datetime import datetime, timezone
from typing import Iterable, Optional

from fastapi import status
from sqlalchemy import and_, delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.core.errors import api_error
from app.models.strike import Strike
from app.models.task import Task, TaskComment, TaskSubmission
from app.models.team import Team, TeamMember
from app.models.user import User
from app.schemas.tasks import (
    CommentRequest,
    CommentResult,
    CreateSubmissionRequest,
    CreateTaskRequest,
    SubmissionResult,
    TaskFilters,
    TaskResult,
    TaskSummary,
    TeamOverview,
    UpdateTaskRequest,
)
from app.scope.resolver import AccessScope
from app.services.documents import file_in_use
from app.services.ingestion import is_allowed_file_url

logger = logging.getLogger(__name__)

Assignee = aliased(User)
Creator = aliased(User)
AssigneeMembership = aliased(TeamMember)


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
    stmt = _task_query(scope).where(Task.team_id.in_(team_ids))
    if filters.assigned_to_me:
        stmt = stmt.where(Task.assigned_to_user_id == scope.user_id)
    if filters.assigned_to_user_id is not None:
        stmt = stmt.where(Task.assigned_to_user_id == filters.assigned_to_user_id)
    if filters.status is not None:
        stmt = stmt.where(Task.status == filters.status)
    if filters.overdue_only:
        stmt = stmt.where(_overdue(now))
    stmt = stmt.order_by(Task.deadline.asc().nulls_last(), Task.created_at.desc()).limit(filters.limit)

    results = [_task_result(scope, row, now) for row in (await db.execute(stmt)).all()]
    return await _add_counts(db, scope, results)


async def get_task(db: AsyncSession, scope: AccessScope, task_id: uuid.UUID) -> TaskResult:
    """
    One task the user may see.

    Raises:
        404 task_not_found — missing, in another org, or in a team the user can't view
    """
    result = _task_result(scope, await _get_task_row(db, scope, task_id), _now())
    return (await _add_counts(db, scope, [result]))[0]


async def check_create_task(db: AsyncSession, scope: AccessScope, body: CreateTaskRequest) -> tuple[str, str]:
    """
    Every rule create_task checks, without saving (D32). The chat agent runs it
    before showing a Confirm card, so a refused task never becomes a card (D45).

    Returns (team name, assignee name) for the card.

    Raises:
        404 team_not_found   — missing, in another org, or not viewable
        403 forbidden        — no assign_task in this team, or the assignee isn't below the user
        404 member_not_found — the assignee isn't on this team
    """
    team_name = await db.scalar(
        select(Team.name).where(Team.id == body.team_id, Team.org_id == scope.org_id)
    )
    if team_name is None or not scope.can_view_team(body.team_id):
        raise api_error(status.HTTP_404_NOT_FOUND, "team_not_found", "Team not found.")
    if not scope.can("assign_task", body.team_id):
        raise api_error(status.HTTP_403_FORBIDDEN, "forbidden", "You can't assign tasks in this team.")
    await _check_assignee(db, scope, body.team_id, body.assigned_to_user_id)
    assignee_name = await db.scalar(select(User.name).where(User.id == body.assigned_to_user_id))
    return team_name, assignee_name or "this person"


async def create_task(db: AsyncSession, scope: AccessScope, body: CreateTaskRequest) -> TaskResult:
    """
    Create a task for a team member ranked below the user (D32). Also used by the
    chat agent after the user clicks Confirm (D22), with the scope of the click's
    own request, so the rules are checked again at that moment.

    Raises: see check_create_task.
    """
    await check_create_task(db, scope, body)

    task = Task(
        id=uuid.uuid4(),
        team_id=body.team_id,
        title=body.title,
        description=body.description,
        assigned_to_user_id=body.assigned_to_user_id,
        created_by_user_id=scope.user_id,
        deadline=body.deadline,
        status="todo",
    )
    db.add(task)
    await db.commit()
    logger.info("User %s created task %s in team %s", scope.user_id, task.id, body.team_id)
    return await get_task(db, scope, task.id)


async def update_task(
    db: AsyncSession, scope: AccessScope, task_id: uuid.UUID, body: UpdateTaskRequest
) -> TaskResult:
    """
    Change a task (D33). The assignee may only change the status; the task's
    managers may change anything, and a new assignee follows D32.

    Raises:
        404 task_not_found   — missing or not visible
        403 forbidden        — not allowed to make this change
        404 member_not_found — the new assignee isn't on the team
    """
    row = await _get_task_row(db, scope, task_id)
    task = row.Task
    changes = body.model_dump(include=body.model_fields_set)
    if not changes:
        return _task_result(scope, row, _now())

    is_manager = can_manage_task(scope, task.team_id, row.assignee_role_id)
    if not is_manager:
        if set(changes) != {"status"}:
            raise api_error(
                status.HTTP_403_FORBIDDEN,
                "forbidden",
                "Only managers above the assignee can edit, reassign or delete this task.",
            )
        if task.assigned_to_user_id != scope.user_id:
            raise api_error(status.HTTP_403_FORBIDDEN, "forbidden", "You can't change this task.")

    new_assignee = changes.get("assigned_to_user_id")
    if new_assignee is not None and new_assignee != task.assigned_to_user_id:
        await _check_assignee(db, scope, task.team_id, new_assignee)

    for field, value in changes.items():
        setattr(task, field, value)
    await db.commit()
    logger.info("User %s changed task %s: %s", scope.user_id, task_id, sorted(changes))
    return await get_task(db, scope, task_id)


async def delete_task(db: AsyncSession, scope: AccessScope, task_id: uuid.UUID) -> None:
    """
    Delete a task; only its managers (D33). Its comments go with it (ON DELETE
    CASCADE); submissions are removed too, and tasks waiting on it stop waiting.

    Raises:
        404 task_not_found — missing or not visible
        403 forbidden      — not one of the task's managers
    """
    row = await _get_task_row(db, scope, task_id)
    if not can_manage_task(scope, row.Task.team_id, row.assignee_role_id):
        raise api_error(
            status.HTTP_403_FORBIDDEN,
            "forbidden",
            "Only managers above the assignee can edit, reassign or delete this task.",
        )
    await db.execute(
        update(Task).where(Task.blocked_by_task_id == task_id).values(blocked_by_task_id=None)
    )
    await db.execute(delete(TaskSubmission).where(TaskSubmission.task_id == task_id))
    await db.execute(delete(Task).where(Task.id == task_id))
    await db.commit()
    logger.info("User %s deleted task %s", scope.user_id, task_id)


async def team_summary(
    db: AsyncSession,
    scope: AccessScope,
    only_team_ids: Iterable[uuid.UUID] | None = None,
) -> list[TeamOverview]:
    """
    One overview per team the user can view, sorted by team name.
    only_team_ids narrows it (e.g. one team's page); teams the user can't view are dropped.
    """
    if only_team_ids is None:
        team_ids = list(scope.viewable_team_ids)
    else:
        team_ids = [team_id for team_id in only_team_ids if scope.can_view_team(team_id)]
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


async def my_task_summary(db: AsyncSession, scope: AccessScope) -> TaskSummary:
    """The user's own tasks (in teams they can view), counted by status, plus overdue (D47)."""
    summary = TaskSummary()
    team_ids = list(scope.viewable_team_ids)
    if not team_ids:
        return summary
    mine = and_(Task.team_id.in_(team_ids), Task.assigned_to_user_id == scope.user_id)
    status_counts = await db.execute(
        select(Task.status, func.count()).where(mine).group_by(Task.status)
    )
    for task_status, count in status_counts.all():
        setattr(summary, task_status, count)
    summary.overdue = await db.scalar(
        select(func.count()).select_from(Task).where(mine, _overdue(_now()))
    ) or 0
    return summary


async def upcoming_tasks(db: AsyncSession, scope: AccessScope, limit: int = 5) -> list[TaskResult]:
    """The user's unfinished tasks, soonest deadline first (tasks without one last) (D47)."""
    team_ids = list(scope.viewable_team_ids)
    if not team_ids:
        return []
    now = _now()
    stmt = (
        _task_query(scope)
        .where(
            Task.team_id.in_(team_ids),
            Task.assigned_to_user_id == scope.user_id,
            Task.status != "done",
        )
        .order_by(Task.deadline.asc().nulls_last(), Task.created_at.desc())
        .limit(limit)
    )
    results = [_task_result(scope, row, now) for row in (await db.execute(stmt)).all()]
    return await _add_counts(db, scope, results)


# ── hand-ins (D59) ────────────────────────────────────────────────────────────

async def list_submissions(
    db: AsyncSession, scope: AccessScope, task_id: uuid.UUID
) -> list[SubmissionResult]:
    """
    The task's hand-ins you may see, newest first: all of them for the task's
    managers, otherwise only your own (an earlier assignee still sees theirs).

    Raises:
        404 task_not_found — missing or not visible
    """
    row = await _get_task_row(db, scope, task_id)
    stmt = (
        select(TaskSubmission, User.name.label("submitted_by_name"))
        .join(User, User.id == TaskSubmission.submitted_by_user_id)
        .where(TaskSubmission.task_id == task_id)
        .order_by(TaskSubmission.submitted_at.desc())
    )
    if not can_manage_task(scope, row.Task.team_id, row.assignee_role_id):
        stmt = stmt.where(TaskSubmission.submitted_by_user_id == scope.user_id)
    return [
        _submission_result(scope, r.TaskSubmission, r.submitted_by_name)
        for r in (await db.execute(stmt)).all()
    ]


async def create_submission(
    db: AsyncSession, scope: AccessScope, task_id: uuid.UUID, body: CreateSubmissionRequest
) -> SubmissionResult:
    """
    Hand in work on a task: only its current assignee. The status doesn't change.

    Raises:
        404 task_not_found   — missing or not visible
        403 forbidden        — you aren't the person doing this task
        400 invalid_file_url — not an UploadThing link
        409 file_in_use      — this file is already on a hand-in or a document (D40)
    """
    row = await _get_task_row(db, scope, task_id)
    if row.Task.assigned_to_user_id != scope.user_id:
        raise api_error(
            status.HTTP_403_FORBIDDEN, "forbidden", "Only the person doing this task can hand in work."
        )
    if not is_allowed_file_url(body.file_url):
        raise api_error(
            status.HTTP_400_BAD_REQUEST, "invalid_file_url", "That file link isn't an uploaded file."
        )
    if await file_in_use(db, body.file_url):
        raise api_error(status.HTTP_409_CONFLICT, "file_in_use", "This file has already been used.")

    submission = TaskSubmission(
        task_id=task_id,
        submitted_by_user_id=scope.user_id,
        file_url=body.file_url,
        file_name=body.file_name,
        file_size=body.file_size,
        notes=body.notes or None,
    )
    db.add(submission)
    await db.commit()
    await db.refresh(submission)
    name = await db.scalar(select(User.name).where(User.id == scope.user_id))
    logger.info("User %s handed in work on task %s", scope.user_id, task_id)
    return _submission_result(scope, submission, name or "")


async def delete_submission(
    db: AsyncSession, scope: AccessScope, task_id: uuid.UUID, submission_id: uuid.UUID
) -> None:
    """
    Delete one of your own hand-ins. Removing the file from UploadThing is the
    caller's job (the Next.js Server Action, like documents).

    Raises:
        404 task_not_found / submission_not_found — missing or not visible to you
        403 forbidden — someone else handed it in
    """
    row = await _get_task_row(db, scope, task_id)
    submission = await db.scalar(
        select(TaskSubmission).where(
            TaskSubmission.id == submission_id, TaskSubmission.task_id == task_id
        )
    )
    is_manager = can_manage_task(scope, row.Task.team_id, row.assignee_role_id)
    if submission is None or (submission.submitted_by_user_id != scope.user_id and not is_manager):
        raise api_error(status.HTTP_404_NOT_FOUND, "submission_not_found", "Hand-in not found.")
    if submission.submitted_by_user_id != scope.user_id:
        raise api_error(
            status.HTTP_403_FORBIDDEN, "forbidden", "Only the person who handed it in can delete it."
        )
    await db.delete(submission)
    await db.commit()
    logger.info("User %s deleted hand-in %s on task %s", scope.user_id, submission_id, task_id)


# ── comments (D60) ────────────────────────────────────────────────────────────

async def list_comments(db: AsyncSession, scope: AccessScope, task_id: uuid.UUID) -> list[CommentResult]:
    """
    A task's comments, oldest first. Anyone who can see the task reads them.

    Raises:
        404 task_not_found — missing or not visible
    """
    await _get_task_row(db, scope, task_id)
    rows = (
        await db.execute(
            select(TaskComment, User.name.label("author_name"))
            .join(User, User.id == TaskComment.user_id)
            .where(TaskComment.task_id == task_id)
            .order_by(TaskComment.created_at.asc())
        )
    ).all()
    return [_comment_result(scope, r.TaskComment, r.author_name) for r in rows]


async def add_comment(
    db: AsyncSession, scope: AccessScope, task_id: uuid.UUID, body: CommentRequest
) -> CommentResult:
    """
    Post a comment on a task; anyone who can see the task may.

    Raises:
        404 task_not_found — missing or not visible
    """
    await _get_task_row(db, scope, task_id)
    comment = TaskComment(task_id=task_id, user_id=scope.user_id, content=body.content)
    db.add(comment)
    await db.commit()
    await db.refresh(comment)
    name = await db.scalar(select(User.name).where(User.id == scope.user_id))
    logger.info("User %s commented on task %s", scope.user_id, task_id)
    return _comment_result(scope, comment, name or "")


async def edit_comment(
    db: AsyncSession, scope: AccessScope, task_id: uuid.UUID, comment_id: uuid.UUID, body: CommentRequest
) -> CommentResult:
    """
    Change the text of your own comment; it then shows "(edited)".

    Raises:
        404 task_not_found / comment_not_found — missing or not visible
        403 forbidden — someone else wrote it
    """
    comment = await _own_comment(db, scope, task_id, comment_id, "edit")
    comment.content = body.content
    comment.edited_at = _now()
    await db.commit()
    await db.refresh(comment)
    name = await db.scalar(select(User.name).where(User.id == comment.user_id))
    logger.info("User %s edited comment %s on task %s", scope.user_id, comment_id, task_id)
    return _comment_result(scope, comment, name or "")


async def delete_comment(
    db: AsyncSession, scope: AccessScope, task_id: uuid.UUID, comment_id: uuid.UUID
) -> None:
    """
    Delete your own comment.

    Raises:
        404 task_not_found / comment_not_found — missing or not visible
        403 forbidden — someone else wrote it
    """
    comment = await _own_comment(db, scope, task_id, comment_id, "delete")
    await db.delete(comment)
    await db.commit()
    logger.info("User %s deleted comment %s on task %s", scope.user_id, comment_id, task_id)


async def _own_comment(
    db: AsyncSession, scope: AccessScope, task_id: uuid.UUID, comment_id: uuid.UUID, verb: str
) -> TaskComment:
    """The comment, if the task is visible, it's on that task and you wrote it (D60 b)."""
    await _get_task_row(db, scope, task_id)
    comment = await db.scalar(
        select(TaskComment).where(TaskComment.id == comment_id, TaskComment.task_id == task_id)
    )
    if comment is None:
        raise api_error(status.HTTP_404_NOT_FOUND, "comment_not_found", "Comment not found.")
    if comment.user_id != scope.user_id:
        raise api_error(
            status.HTTP_403_FORBIDDEN, "forbidden", f"You can only {verb} your own comments."
        )
    return comment


def _comment_result(scope: AccessScope, comment: TaskComment, name: str) -> CommentResult:
    mine = comment.user_id == scope.user_id
    return CommentResult(
        id=comment.id,
        task_id=comment.task_id,
        author_user_id=comment.user_id,
        author_name=name,
        content=comment.content,
        created_at=comment.created_at,
        edited_at=comment.edited_at,
        can_edit=mine,
        can_delete=mine,
    )


def _submission_result(scope: AccessScope, submission: TaskSubmission, name: str) -> SubmissionResult:
    return SubmissionResult(
        id=submission.id,
        task_id=submission.task_id,
        submitted_by_user_id=submission.submitted_by_user_id,
        submitted_by_name=name,
        file_url=submission.file_url,
        file_name=submission.file_name,
        file_size=submission.file_size,
        notes=submission.notes,
        submitted_at=submission.submitted_at,
        can_delete=submission.submitted_by_user_id == scope.user_id,
    )


# ── task helpers ──────────────────────────────────────────────────────────────

async def _get_task_row(db: AsyncSession, scope: AccessScope, task_id: uuid.UUID):
    """The task's _task_query row, or 404 if it's missing or in a team the user can't view."""
    row = (await db.execute(_task_query(scope).where(Task.id == task_id))).first()
    if row is None or not scope.can_view_team(row.Task.team_id):
        raise api_error(status.HTTP_404_NOT_FOUND, "task_not_found", "Task not found.")
    return row


def _task_query(scope: AccessScope):
    """Tasks in the user's org with team name, assignee and creator names, and the assignee's team role."""
    return (
        select(
            Task,
            Team.name.label("team_name"),
            Assignee.name.label("assignee_name"),
            Creator.name.label("creator_name"),
            AssigneeMembership.role_id.label("assignee_role_id"),
        )
        .join(Team, Team.id == Task.team_id)
        .outerjoin(Assignee, Assignee.id == Task.assigned_to_user_id)
        .outerjoin(Creator, Creator.id == Task.created_by_user_id)
        .outerjoin(
            AssigneeMembership,
            and_(
                AssigneeMembership.team_id == Task.team_id,
                AssigneeMembership.user_id == Task.assigned_to_user_id,
            ),
        )
        .where(Team.org_id == scope.org_id)
    )


def can_manage_task(
    scope: AccessScope, team_id: uuid.UUID, assignee_role_id: Optional[uuid.UUID]
) -> bool:
    """
    D33: could the user have created this task? assign_task in the team, and the
    assignee ranks below them. An assignee who left the team (no role) doesn't block.
    """
    if not scope.can("assign_task", team_id):
        return False
    return assignee_role_id is None or scope.can_give_in_team(assignee_role_id, team_id)


def _task_result(scope: AccessScope, row, now: datetime) -> TaskResult:
    task = row.Task
    can_edit = can_manage_task(scope, task.team_id, row.assignee_role_id)
    return TaskResult(
        id=task.id,
        team_id=task.team_id,
        team_name=row.team_name,
        title=task.title,
        description=task.description,
        assigned_to_user_id=task.assigned_to_user_id,
        assigned_to_name=row.assignee_name,
        created_by_name=row.creator_name,
        deadline=task.deadline,
        status=task.status,
        overdue=task.deadline is not None and task.deadline < now and task.status != "done",
        can_edit=can_edit,
        can_change_status=can_edit or task.assigned_to_user_id == scope.user_id,
        can_submit=task.assigned_to_user_id == scope.user_id,
        can_view_submissions=can_edit or task.assigned_to_user_id == scope.user_id,
    )


async def _add_counts(
    db: AsyncSession, scope: AccessScope, results: list[TaskResult]
) -> list[TaskResult]:
    """
    Fill the counts on each task's buttons: comment_count for everyone (D60);
    submission_count = all hand-ins for a task's managers, your own for the assignee (D59).
    """
    if not results:
        return results
    comment_counts = dict(
        (
            await db.execute(
                select(TaskComment.task_id, func.count())
                .where(TaskComment.task_id.in_([t.id for t in results]))
                .group_by(TaskComment.task_id)
            )
        ).all()
    )
    for t in results:
        t.comment_count = comment_counts.get(t.id, 0)

    task_ids = [t.id for t in results if t.can_view_submissions]
    if not task_ids:
        return results
    rows = (
        await db.execute(
            select(
                TaskSubmission.task_id,
                func.count().label("total"),
                func.count().filter(TaskSubmission.submitted_by_user_id == scope.user_id).label("mine"),
            )
            .where(TaskSubmission.task_id.in_(task_ids))
            .group_by(TaskSubmission.task_id)
        )
    ).all()
    counts = {row.task_id: row for row in rows}
    for t in results:
        if t.can_view_submissions:
            row = counts.get(t.id)
            t.submission_count = 0 if row is None else (row.total if t.can_edit else row.mine)
    return results


async def _check_assignee(
    db: AsyncSession, scope: AccessScope, team_id: uuid.UUID, user_id: uuid.UUID
) -> None:
    """D32: the assignee is on the team, with a team role below the user, and isn't the user."""
    # Checked by user, not role: your own team role can sit below your org role (D32).
    if user_id == scope.user_id:
        raise api_error(
            status.HTTP_403_FORBIDDEN, "forbidden", "You can't give a task to yourself."
        )
    role_id = await db.scalar(
        select(TeamMember.role_id).where(TeamMember.team_id == team_id, TeamMember.user_id == user_id)
    )
    if role_id is None:
        raise api_error(
            status.HTTP_404_NOT_FOUND, "member_not_found", "That person isn't on this team."
        )
    if not scope.can_give_in_team(role_id, team_id):
        raise api_error(
            status.HTTP_403_FORBIDDEN,
            "forbidden",
            "You can only give tasks to people ranked below you on this team.",
        )
