"""
app/api/v1/tasks.py — Task routes for /tasks and the team page (Ticket 12 D32/D33),
plus hand-ins (D59) and comments (D60) on a task

The router requires an org (get_org_context); every route also depends on get_scope.
The checks themselves live in app/services/tasks.py, shared with the chat agent.
"""
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_org_context, get_scope
from app.core.errors import error_responses
from app.schemas.tasks import (
    CommentListResponse,
    CommentRequest,
    CommentResult,
    CreateSubmissionRequest,
    CreateTaskRequest,
    SubmissionListResponse,
    SubmissionResult,
    TaskFilters,
    TaskListResponse,
    TaskResult,
    TaskStatus,
    UpdateTaskRequest,
)
from app.scope.resolver import AccessScope
from app.services import tasks

router = APIRouter(prefix="/tasks", tags=["tasks"], dependencies=[Depends(get_org_context)])


@router.get(
    "",
    response_model=TaskListResponse,
    responses=error_responses(400, 401, 404, 409, 503),
)
async def list_tasks(
    team_id: Optional[uuid.UUID] = None,
    assigned_to_me: bool = False,
    task_status: Optional[TaskStatus] = Query(None, alias="status"),
    overdue_only: bool = False,
    limit: int = Query(100, ge=1, le=200),
    scope: AccessScope = Depends(get_scope),
    db: AsyncSession = Depends(get_db),
) -> TaskListResponse:
    """
    Tasks the caller can see (teams they're on or oversee), soonest deadline first.
    Filters: one team, only mine, a status, only overdue. Each task has can_edit /
    can_change_status for its buttons (D33).
    """
    filters = TaskFilters(
        team_id=team_id,
        assigned_to_me=assigned_to_me,
        status=task_status,
        overdue_only=overdue_only,
        limit=limit,
    )
    return TaskListResponse(tasks=await tasks.list_tasks(db, scope, filters))


@router.post(
    "",
    response_model=TaskResult,
    status_code=status.HTTP_201_CREATED,
    responses=error_responses(400, 401, 403, 404, 409, 503),
)
async def create_task(
    body: CreateTaskRequest,
    scope: AccessScope = Depends(get_scope),
    db: AsyncSession = Depends(get_db),
) -> TaskResult:
    """Create a task for a team member ranked below you (needs assign_task in that team, D32)."""
    return await tasks.create_task(db, scope, body)


@router.patch(
    "/{task_id}",
    response_model=TaskResult,
    responses=error_responses(400, 401, 403, 404, 409, 503),
)
async def update_task(
    task_id: uuid.UUID,
    body: UpdateTaskRequest,
    scope: AccessScope = Depends(get_scope),
    db: AsyncSession = Depends(get_db),
) -> TaskResult:
    """
    Change a task; only the fields sent change. The assignee may change only the
    status; managers above the assignee may change anything (D33).
    """
    return await tasks.update_task(db, scope, task_id, body)


@router.delete(
    "/{task_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses=error_responses(400, 401, 403, 404, 409, 503),
)
async def delete_task(
    task_id: uuid.UUID,
    scope: AccessScope = Depends(get_scope),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Delete a task; only managers above the assignee (D33)."""
    await tasks.delete_task(db, scope, task_id)


@router.get(
    "/{task_id}",
    response_model=TaskResult,
    responses=error_responses(400, 401, 404, 409, 503),
)
async def get_task(
    task_id: uuid.UUID,
    scope: AccessScope = Depends(get_scope),
    db: AsyncSession = Depends(get_db),
) -> TaskResult:
    """One task the caller can see, with its button flags (the upload route checks can_submit)."""
    return await tasks.get_task(db, scope, task_id)


# ── hand-ins (D59) ────────────────────────────────────────────────────────────

@router.get(
    "/{task_id}/submissions",
    response_model=SubmissionListResponse,
    responses=error_responses(400, 401, 404, 409, 503),
)
async def list_submissions(
    task_id: uuid.UUID,
    scope: AccessScope = Depends(get_scope),
    db: AsyncSession = Depends(get_db),
) -> SubmissionListResponse:
    """
    The task's hand-ins you may see, newest first: all of them for the task's
    managers, otherwise only your own.
    """
    return SubmissionListResponse(submissions=await tasks.list_submissions(db, scope, task_id))


@router.post(
    "/{task_id}/submissions",
    response_model=SubmissionResult,
    status_code=status.HTTP_201_CREATED,
    responses=error_responses(400, 401, 403, 404, 409, 503),
)
async def create_submission(
    task_id: uuid.UUID,
    body: CreateSubmissionRequest,
    scope: AccessScope = Depends(get_scope),
    db: AsyncSession = Depends(get_db),
) -> SubmissionResult:
    """
    Hand in work on a task (a file already uploaded to UploadThing + an optional
    note). Only the person doing the task; the status doesn't change.
    """
    return await tasks.create_submission(db, scope, task_id, body)


@router.delete(
    "/{task_id}/submissions/{submission_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses=error_responses(400, 401, 403, 404, 409, 503),
)
async def delete_submission(
    task_id: uuid.UUID,
    submission_id: uuid.UUID,
    scope: AccessScope = Depends(get_scope),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Delete one of your own hand-ins (the Server Action then removes the file)."""
    await tasks.delete_submission(db, scope, task_id, submission_id)


# ── comments (D60) ────────────────────────────────────────────────────────────

@router.get(
    "/{task_id}/comments",
    response_model=CommentListResponse,
    responses=error_responses(400, 401, 404, 409, 503),
)
async def list_comments(
    task_id: uuid.UUID,
    scope: AccessScope = Depends(get_scope),
    db: AsyncSession = Depends(get_db),
) -> CommentListResponse:
    """The task's comments, oldest first; anyone who can see the task."""
    return CommentListResponse(comments=await tasks.list_comments(db, scope, task_id))


@router.post(
    "/{task_id}/comments",
    response_model=CommentResult,
    status_code=status.HTTP_201_CREATED,
    responses=error_responses(400, 401, 404, 409, 503),
)
async def add_comment(
    task_id: uuid.UUID,
    body: CommentRequest,
    scope: AccessScope = Depends(get_scope),
    db: AsyncSession = Depends(get_db),
) -> CommentResult:
    """Post a plain-text comment on a task you can see."""
    return await tasks.add_comment(db, scope, task_id, body)


@router.patch(
    "/{task_id}/comments/{comment_id}",
    response_model=CommentResult,
    responses=error_responses(400, 401, 403, 404, 409, 503),
)
async def edit_comment(
    task_id: uuid.UUID,
    comment_id: uuid.UUID,
    body: CommentRequest,
    scope: AccessScope = Depends(get_scope),
    db: AsyncSession = Depends(get_db),
) -> CommentResult:
    """Change your own comment's text; it then shows "(edited)"."""
    return await tasks.edit_comment(db, scope, task_id, comment_id, body)


@router.delete(
    "/{task_id}/comments/{comment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses=error_responses(400, 401, 403, 404, 409, 503),
)
async def delete_comment(
    task_id: uuid.UUID,
    comment_id: uuid.UUID,
    scope: AccessScope = Depends(get_scope),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Delete your own comment."""
    await tasks.delete_comment(db, scope, task_id, comment_id)
