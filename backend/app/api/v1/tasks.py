"""
app/api/v1/tasks.py — Task routes for /tasks and the team page (Ticket 12 D32/D33)

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
    CreateTaskRequest,
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
